import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        select: { id: true },
      });

      if (expiredOrders.length === 0) {
        this.logger.log('[handlePaymentTimeout] No expired pending orders found.');
        return;
      }

      let cancelledCount = 0;

      for (const order of expiredOrders) {
        try {
          const items = await this.prisma.orderItem.findMany({
            where: { orderId: order.id },
            select: { skuId: true, quantity: true },
          });

          // Group quantities by SKU (handle potential duplicates within order)
          const skuQuantityMap = new Map<string, number>();
          for (const item of items) {
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

            // Update order status to cancelled
            await tx.order.update({
              where: { id: order.id },
              data: { status: 'cancelled' },
            });

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
        } catch (err) {
          this.logger.error(
            `[handlePaymentTimeout] Failed to cancel order ${order.id}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[handlePaymentTimeout] Completed. Cancelled ${cancelledCount} expired orders.`,
      );
    } catch (err) {
      this.logger.error(
        `[handlePaymentTimeout] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Every 1 minute: Query pending orders from last 5 minutes for payment callback compensation.
   * Stub — will integrate with WeChat payment query API later.
   */
  @Cron('*/1 * * * *')
  async handlePaymentCallbackCompensation(): Promise<void> {
    this.logger.log('[handlePaymentCallbackCompensation] Starting compensation check...');

    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      const pendingOrders = await this.prisma.order.findMany({
        where: {
          status: 'pending',
          createdAt: { gte: fiveMinutesAgo },
        },
        select: { id: true, orderNo: true },
      });

      if (pendingOrders.length === 0) {
        this.logger.log('[handlePaymentCallbackCompensation] No pending orders in last 5 minutes.');
        return;
      }

      // TODO: Integrate with WeChat payment status query API
      // For now, just log the orders that need verification
      this.logger.log(
        `[handlePaymentCallbackCompensation] Found ${pendingOrders.length} orders to verify: ` +
          pendingOrders.map((o) => o.orderNo).join(', '),
      );

      this.logger.log(
        `[handlePaymentCallbackCompensation] Completed. ${pendingOrders.length} orders pending verification.`,
      );
    } catch (err) {
      this.logger.error(
        `[handlePaymentCallbackCompensation] Fatal error: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Daily at 3am: Find expired points and deduct from PointsAccount balance.
   * Compares sum of expired earn transactions against already-processed expire transactions.
   */
  @Cron('0 3 * * *')
  async handlePointsExpiration(): Promise<void> {
    this.logger.log('[handlePointsExpiration] Starting points expiration check...');

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
          const alreadyExpiredResult = await this.prisma.pointsTransaction.aggregate({
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
    this.logger.log('[handleDishScheduledPublish] Starting scheduled dish publish check...');

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
    this.logger.log('[handleEndOfDayComplete] Starting end-of-day order completion...');

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
}
