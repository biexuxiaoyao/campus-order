import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly payment: PaymentService,
  ) {}

  /**
   * Every 1 minute: Cancel orders with status='pending' that are older than 15 minutes.
   * Release held inventory by updating SKU availableStock.
   */
  @Cron('*/1 * * * *')
  async handlePaymentTimeout(): Promise<void> {
    this.logger.log('[handlePaymentTimeout] Starting payment timeout check...');

    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: 'pending',
          createdAt: { lt: fifteenMinutesAgo },
        },
        include: {
          payments: {
            where: { status: 'pending' },
            select: { id: true, channel: true },
          },
          items: {
            select: { skuId: true, quantity: true },
          },
        },
      });

      if (expiredOrders.length === 0) {
        this.logger.log(
          '[handlePaymentTimeout] No expired pending orders found.',
        );
        return;
      }

      let cancelledCount = 0;
      let skippedCount = 0;
      let recoveredCount = 0;

      for (const order of expiredOrders) {
        try {
          // 如果有 pending 支付记录，主动查询微信支付状态
          if (order.payments.length > 0) {
            const hasWechatPayment = order.payments.some(
              (p) => p.channel === 'wechat',
            );

            if (hasWechatPayment) {
              // 主动查询微信订单状态
              const wechatResult = await this.payment.queryWechatOrder(
                order.orderNo,
              );

              if (wechatResult) {
                if (wechatResult.tradeState === 'SUCCESS') {
                  // 微信已支付，但回调未到达 — 补偿更新
                  this.logger.warn(
                    `[handlePaymentTimeout] Order ${order.id} (${order.orderNo}) paid on WeChat but callback missed. Recovering...`,
                  );
                  await this.recoverPaidOrder(order.id, wechatResult);
                  recoveredCount++;
                  continue;
                }

                if (
                  ['CLOSED', 'REVOKED', 'PAYERROR'].includes(
                    wechatResult.tradeState,
                  )
                ) {
                  // 微信侧已关闭，可以安全取消
                  this.logger.log(
                    `[handlePaymentTimeout] Order ${order.id} WeChat status=${wechatResult.tradeState}, proceeding to cancel.`,
                  );
                } else {
                  // NOTPAY / USERPAYING — 仍在支付中，继续等待
                  this.logger.log(
                    `[handlePaymentTimeout] Skipping order ${order.id} — WeChat status=${wechatResult.tradeState}.`,
                  );
                  skippedCount++;
                  continue;
                }
              } else {
                // 查询失败，保守跳过
                this.logger.warn(
                  `[handlePaymentTimeout] Skipping order ${order.id} — WeChat query failed.`,
                );
                skippedCount++;
                continue;
              }
            } else {
              // 余额支付没有外部回调，pending 超过 15 分钟视为支付失败，取消订单释放库存
              this.logger.warn(
                `[handlePaymentTimeout] Order ${order.id} — balance payment stuck pending > 15min, cancelling.`,
              );
              // 继续执行取消逻辑（不 continue，fall through 到下面的取消代码）
            }
          }

          // Group quantities by SKU (handle potential duplicates within order)
          const skuQuantityMap = new Map<string, number>();
          for (const item of order.items) {
            const current = skuQuantityMap.get(item.skuId) || 0;
            skuQuantityMap.set(item.skuId, current + item.quantity);
          }

          // Use a transaction: release stock + update order status + add timeline
          await this.prisma.$transaction(async (tx) => {
            // Release inventory for each SKU
            for (const [skuId, quantity] of skuQuantityMap) {
              await tx.sku.update({
                where: { id: skuId },
                data: { availableStock: { increment: quantity } },
              });
            }

            // Update order status to cancelled (only if still pending)
            const updated = await tx.order.updateMany({
              where: { id: order.id, status: 'pending' },
              data: { status: 'cancelled' },
            });

            if (updated.count === 0) return; // Order was already paid or otherwise modified

            // Add timeline entry
            await tx.orderTimeline.create({
              data: {
                orderId: order.id,
                status: 'cancelled',
                timestamp: new Date(),
              },
            });
          });

          cancelledCount++;

          // Fire-and-forget: notify user of payment timeout cancellation
          const fullOrder = await this.prisma.order.findUnique({
            where: { id: order.id },
            select: { userId: true, tenantId: true, orderNo: true },
          });
          if (fullOrder) {
            this.notify
              .sendSubscribeMessage(
                fullOrder.userId,
                fullOrder.tenantId,
                'order_paid',
                {
                  thing1: fullOrder.orderNo,
                  amount2: '0.00 元',
                  thing3: '支付超时已取消',
                },
              )
              .catch((err) =>
                this.logger.error(
                  `[Notify] 支付超时取消通知发送失败: ${(err as Error).message}`,
                ),
              );
          }
        } catch (err) {
          this.logger.error(
            `[handlePaymentTimeout] Failed to cancel order ${order.id}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[handlePaymentTimeout] Completed. Cancelled ${cancelledCount}, recovered ${recoveredCount} missed callbacks, skipped ${skippedCount}.`,
      );
    } catch (err) {
      this.logger.error(
        `[handlePaymentTimeout] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Every 1 minute: Query pending orders from last 5 minutes for payment callback compensation.
   * Actively queries WeChat order status to recover missed payment notifications.
   */
  @Cron('*/1 * * * *')
  async handlePaymentCallbackCompensation(): Promise<void> {
    this.logger.log(
      '[handlePaymentCallbackCompensation] Starting compensation check...',
    );

    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Find orders with pending WeChat payment records
      const pendingPayments = await this.prisma.paymentRecord.findMany({
        where: {
          status: 'pending',
          channel: 'wechat',
          createdAt: { gte: fiveMinutesAgo },
        },
        include: {
          order: { select: { id: true, orderNo: true, status: true } },
        },
      });

      if (pendingPayments.length === 0) {
        this.logger.log(
          '[handlePaymentCallbackCompensation] No pending WeChat payments in last 5 minutes.',
        );
        return;
      }

      let recoveredCount = 0;
      let stillPendingCount = 0;

      // Separate payments with valid orders from orphaned ones
      const validPayments = pendingPayments.filter((p) => p.order);
      for (const p of pendingPayments) {
        if (!p.order) {
          this.logger.warn(
            `[handlePaymentCallbackCompensation] Payment ${p.id} has no order; skipping.`,
          );
          stillPendingCount++;
        }
      }

      if (validPayments.length === 0) {
        this.logger.log(
          `[handlePaymentCallbackCompensation] Completed. Recovered 0, still pending ${stillPendingCount}.`,
        );
        return;
      }

      // Parallel WeChat queries
      const results = await Promise.allSettled(
        validPayments.map((p) =>
          this.payment.queryWechatOrder(p.order!.orderNo).then((r) => ({
            payment: p,
            wechatResult: r,
          })),
        ),
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          stillPendingCount++;
          continue;
        }

        const { payment, wechatResult } = result.value;

        if (!wechatResult) {
          stillPendingCount++;
          continue;
        }

        if (wechatResult.tradeState === 'SUCCESS') {
          try {
            this.logger.warn(
              `[handlePaymentCallbackCompensation] Recovering missed callback for ${payment.order!.orderNo}`,
            );
            await this.recoverPaidOrder(payment.order!.id, wechatResult);
            recoveredCount++;
          } catch (err) {
            this.logger.error(
              `[handlePaymentCallbackCompensation] Failed to recover payment ${payment.id}: ${(err as Error).message}`,
            );
            stillPendingCount++;
          }
        } else if (['NOTPAY', 'USERPAYING'].includes(wechatResult.tradeState)) {
          stillPendingCount++;
        }
        // CLOSED/REVOKED — leave for timeout handler
      }

      this.logger.log(
        `[handlePaymentCallbackCompensation] Completed. Recovered ${recoveredCount}, still pending ${stillPendingCount}.`,
      );
    } catch (err) {
      this.logger.error(
        `[handlePaymentCallbackCompensation] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Recover an order that was paid on WeChat but the callback was missed.
   * Updates the payment record to success and advances the order to 'paid'.
   */
  private async recoverPaidOrder(
    orderId: string,
    wechatResult: {
      tradeState: string;
      transactionId?: string;
      amount?: number;
    },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Update pending payment record to success
      await tx.paymentRecord.updateMany({
        where: { orderId, status: 'pending', channel: 'wechat' },
        data: {
          status: 'success',
          transactionId: wechatResult.transactionId ?? null,
          paidAt: new Date(),
        },
      });

      // Advance order status from pending to paid (only if still pending)
      await tx.order.updateMany({
        where: { id: orderId, status: 'pending' },
        data: { status: 'paid' },
      });

      // Add timeline entry
      await tx.orderTimeline.create({
        data: {
          orderId,
          status: 'paid',
          timestamp: new Date(),
        },
      });
    });

    // Fire-and-forget: notify user that payment has been recovered
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        tenantId: true,
        orderNo: true,
        totalAmount: true,
      },
    });
    if (order) {
      this.notify
        .notifyOrderPaid(order.userId, order.tenantId, {
          orderNo: order.orderNo,
          totalAmount: order.totalAmount,
        })
        .catch((err) =>
          this.logger.error(
            `[recoverPaidOrder] 通知发送失败 order=${orderId}: ${(err as Error).message}`,
          ),
        );
    }

    this.logger.log(
      `[recoverPaidOrder] Order ${orderId} recovered — payment marked as success, order advanced to paid.`,
    );
  }

  /**
   * Daily at 3am: Find expired points and deduct from PointsAccount balance.
   * Compares sum of expired earn transactions against already-processed expire transactions.
   */
  @Cron('0 3 * * *')
  async handlePointsExpiration(): Promise<void> {
    this.logger.log(
      '[handlePointsExpiration] Starting points expiration check...',
    );

    try {
      const now = new Date();

      // Sum expired earn points per account (where expiresAt has passed)
      const expiredEarnByAccount = await this.prisma.pointsTransaction.groupBy({
        by: ['accountId'],
        where: {
          type: 'earn',
          expiresAt: { not: null, lt: now },
        },
        _sum: { points: true },
      });

      if (expiredEarnByAccount.length === 0) {
        this.logger.log('[handlePointsExpiration] No expired points found.');
        return;
      }

      let expiredCount = 0;

      for (const item of expiredEarnByAccount) {
        try {
          const totalExpiredEarn = item._sum.points || 0;

          // Find total already-processed expire transactions for this account
          const alreadyExpiredResult =
            await this.prisma.pointsTransaction.aggregate({
              where: {
                accountId: item.accountId,
                type: 'expire',
              },
              _sum: { points: true },
            });

          const alreadyExpired = alreadyExpiredResult._sum.points || 0;
          const toExpire = totalExpiredEarn - alreadyExpired;

          if (toExpire <= 0) continue;

          // Deduct from account balance and record expire transaction
          await this.prisma.$transaction(async (tx) => {
            const account = await tx.pointsAccount.findUnique({
              where: { id: item.accountId },
              select: { balance: true },
            });

            if (!account || account.balance <= 0) return;

            const deductAmount = Math.min(toExpire, account.balance);

            await tx.pointsAccount.update({
              where: { id: item.accountId },
              data: { balance: { decrement: deductAmount } },
            });

            await tx.pointsTransaction.create({
              data: {
                accountId: item.accountId,
                type: 'expire',
                points: deductAmount,
                createdAt: now,
              },
            });
          });

          expiredCount++;
        } catch (err) {
          this.logger.error(
            `[handlePointsExpiration] Failed to expire points for account ${item.accountId}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[handlePointsExpiration] Completed. Processed ${expiredCount} accounts with expired points.`,
      );
    } catch (err) {
      this.logger.error(
        `[handlePointsExpiration] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Every 1 minute: Publish or unpublish dishes based on scheduled timestamps.
   */
  @Cron('*/1 * * * *')
  async handleDishScheduledPublish(): Promise<void> {
    this.logger.log(
      '[handleDishScheduledPublish] Starting scheduled dish publish check...',
    );

    try {
      const now = new Date();

      // Publish dishes whose scheduledPublishAt has arrived
      const publishResult = await this.prisma.dish.updateMany({
        where: {
          status: 'draft',
          scheduledPublishAt: { not: null, lte: now },
        },
        data: { status: 'published' },
      });

      // Unpublish dishes whose scheduledUnpublishAt has arrived
      const unpublishResult = await this.prisma.dish.updateMany({
        where: {
          status: 'published',
          scheduledUnpublishAt: { not: null, lte: now },
        },
        data: { status: 'offline' },
      });

      this.logger.log(
        `[handleDishScheduledPublish] Completed. ` +
          `Published: ${publishResult.count}, Unpublished: ${unpublishResult.count}.`,
      );
    } catch (err) {
      this.logger.error(
        `[handleDishScheduledPublish] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Daily at 22:00: Auto-complete orders still in 'ready' status (set to 'picked').
   */
  @Cron('0 22 * * *')
  async handleEndOfDayComplete(): Promise<void> {
    this.logger.log(
      '[handleEndOfDayComplete] Starting end-of-day order completion...',
    );

    try {
      const result = await this.prisma.order.updateMany({
        where: { status: 'ready' },
        data: { status: 'picked' },
      });

      this.logger.log(
        `[handleEndOfDayComplete] Completed. ${result.count} orders moved from 'ready' to 'picked'.`,
      );
    } catch (err) {
      this.logger.error(
        `[handleEndOfDayComplete] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Daily at 8am: Notify users of coupons expiring within 3 days.
   */
  @Cron('0 8 * * *')
  async handleCouponExpirationNotify(): Promise<void> {
    this.logger.log(
      '[handleCouponExpirationNotify] Starting coupon expiration check...',
    );

    try {
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      // Find coupons expiring within 3 days that are still available
      const expiringCoupons = await this.prisma.userCoupon.findMany({
        where: {
          status: 'available',
          template: {
            endAt: { not: null, lte: threeDaysFromNow, gt: new Date() },
          },
        },
        include: {
          template: { select: { name: true, endAt: true } },
        },
      });

      if (expiringCoupons.length === 0) {
        this.logger.log(
          '[handleCouponExpirationNotify] No expiring coupons found.',
        );
        return;
      }

      // Group by userId to avoid duplicate notifications
      const userCouponMap = new Map<
        string,
        { userId: string; tenantId: string; coupons: string[] }
      >();

      for (const uc of expiringCoupons) {
        // Need to get tenantId from the User record
        const user = await this.prisma.user.findUnique({
          where: { id: uc.userId },
          select: { tenantId: true },
        });
        if (!user) continue;

        const key = uc.userId;
        if (!userCouponMap.has(key)) {
          userCouponMap.set(key, {
            userId: uc.userId,
            tenantId: user.tenantId,
            coupons: [],
          });
        }
        userCouponMap
          .get(key)!
          .coupons.push(
            `${uc.template.name}(${uc.template.endAt!.toISOString().slice(0, 10)}到期)`,
          );
      }

      let notifiedCount = 0;
      for (const [, info] of userCouponMap) {
        const couponList = info.coupons.slice(0, 3).join('、');
        const displayName =
          info.coupons.length > 3
            ? `${couponList}等${info.coupons.length}张`
            : couponList;

        await this.notify
          .notifyCouponExpiring([info.userId], info.tenantId, displayName, '')
          .catch((err) =>
            this.logger.error(
              `[Notify] 优惠券过期通知发送失败 (userId=${info.userId}): ${(err as Error).message}`,
            ),
          );
        notifiedCount++;
      }

      this.logger.log(
        `[handleCouponExpirationNotify] Completed. Notified ${notifiedCount} users about expiring coupons.`,
      );
    } catch (err) {
      this.logger.error(
        `[handleCouponExpirationNotify] Fatal error: ${(err as Error).message}`,
      );
    }
  }
}
