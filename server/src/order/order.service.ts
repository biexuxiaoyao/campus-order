import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { PaymentService } from '../payment/payment.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['confirmed', 'refunding'],
  confirmed: ['cooking', 'refunding'],
  cooking: ['ready', 'refunding'],
  ready: ['picked', 'refunding'],
  refunding: ['refunded'],
};

/** Generate order number: YYYYMMDD + 10 random digits */
function generateOrderNo(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 1e10)
    .toString()
    .padStart(10, '0');
  return `${y}${m}${d}${rand}`;
}

/** Format SKU specs JSON into a readable string */
function formatSpecName(specs: any): string {
  if (!specs) return '';
  if (typeof specs === 'string') return specs;
  if (Array.isArray(specs)) {
    return specs.map((s: any) => s.value).join('/');
  }
  const entries = Object.entries(specs as Record<string, any>);
  return entries.map(([, v]) => v).join('/');
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private prisma: PrismaService,
    private notify: NotifyService,
    private payment: PaymentService,
  ) {}

  /** Create an order from cart items */
  async create(userId: string, tenantId: string, dto: CreateOrderDto) {
    const { cartItemIds, pickupTime, remark, paymentMethod } = dto;

    // 1. Fetch cart items belonging to this user
    const cartItems = await this.prisma.cartItem.findMany({
      where: {
        id: { in: cartItemIds },
        userId,
        tenantId,
      },
    });

    if (cartItems.length !== cartItemIds.length) {
      throw new ConflictException('部分购物车项不存在或不属于当前用户');
    }

    // 2. Validate SKUs and compute total
    const skuIds = [...new Set(cartItems.map((c) => c.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      include: { dish: true },
    });

    const skuMap = new Map(skus.map((s) => [s.id, s]));

    // Determine store from the first SKU's dish
    const firstSku = skuMap.get(cartItems[0].skuId);
    if (!firstSku?.dish?.storeId) {
      throw new ConflictException('无法识别菜品所属门店');
    }
    const storeId = firstSku.dish.storeId;

    // Validate stock for all items
    for (const item of cartItems) {
      const sku = skuMap.get(item.skuId);
      if (!sku || sku.status !== 'active') {
        throw new ConflictException(`SKU ${item.skuId} 不存在或已下架`);
      }
      if (sku.availableStock < item.quantity) {
        throw new ConflictException(
          `SKU ${item.skuId} 库存不足（需要 ${item.quantity}，可用 ${sku.availableStock}）`,
        );
      }
    }

    // 3. Compute order items data
    const orderItemsData = cartItems.map((item) => {
      const sku = skuMap.get(item.skuId)!;
      return {
        skuId: item.skuId,
        dishName: sku.dish.name,
        specName: formatSpecName(sku.specs),
        price: sku.price,
        quantity: item.quantity,
      };
    });

    const totalAmount = orderItemsData.reduce(
      (sum, oi) => sum + oi.price * oi.quantity,
      0,
    );

    const orderNo = generateOrderNo();

    // 4. Execute transaction: deduct stock + create order + delete cart items
    const order = await this.prisma.$transaction(async (tx) => {
      // Deduct stock with optimistic lock
      for (const item of cartItems) {
        const sku = skuMap.get(item.skuId)!;
        const result = await tx.sku.updateMany({
          where: {
            id: item.skuId,
            version: sku.version,
            availableStock: { gte: item.quantity },
          },
          data: {
            availableStock: { decrement: item.quantity },
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new ConflictException(`SKU ${item.skuId} 库存扣减失败，请重试`);
        }
      }

      // Create order
      const created = await tx.order.create({
        data: {
          orderNo,
          tenantId,
          userId,
          storeId,
          type: 'individual',
          status: 'pending',
          totalAmount,
          pickupTime: pickupTime ? new Date(pickupTime) : undefined,
          remark,
          paymentMethod,
          items: {
            create: orderItemsData,
          },
          timeline: {
            create: { status: 'pending' },
          },
        },
        include: {
          items: true,
          timeline: true,
        },
      });

      // Delete cart items
      await tx.cartItem.deleteMany({
        where: { id: { in: cartItemIds } },
      });

      return created;
    });

    return order;
  }

  /** User: list my orders with filtering and pagination */
  async findAll(tenantId: string, userId: string, query: QueryOrderDto) {
    const { status, startDate, endDate, page = 1, pageSize = 20 } = query;

    const where: any = { tenantId, userId };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((order) => ({
        ...order,
        itemCount: order.items.length,
        items: undefined,
      })),
      total,
      hasMore: page * pageSize < total,
    };
  }

  /** User: get order detail with items, timeline, payments */
  async findOne(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('无权查看该订单');
    }

    return order;
  }

  /** Merchant: list orders by store with filters */
  async findByStore(storeId: string, tenantId: string, query: any) {
    const { status, date, page = 1, pageSize = 20 } = query;

    const where: any = { storeId, tenantId };

    if (status) {
      where.status = status;
    }

    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = { gte: startOfDay, lte: endOfDay };
    }

    const [total, items] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          items: { select: { id: true } },
          user: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((order) => ({
        ...order,
        itemCount: order.items.length,
        items: undefined,
        user: order.user,
      })),
      total,
      hasMore: page * pageSize < total,
    };
  }

  /** Update order status with optimistic lock and timeline */
  async updateStatus(
    orderId: string,
    newStatus: string,
    _operatorId: string,
    _reason?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `不允许从 ${order.status} 转换到 ${newStatus}`,
      );
    }

    // If moving to picked, it must be from ready
    if (newStatus === 'picked' && order.status !== 'ready') {
      throw new BadRequestException('只有已备好的订单才能标记为已取餐');
    }

    // Build update data
    const updateData: any = { status: newStatus };

    // Generate pickup number when moving to ready
    if (newStatus === 'ready') {
      const pickupNo = await this.generatePickupNo(order.storeId);
      updateData.pickupNo = pickupNo;
    }

    // Optimistic lock: check version
    const result = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        version: order.version,
      },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('订单已被修改，请刷新后重试');
    }

    // Add timeline entry
    await this.prisma.orderTimeline.create({
      data: {
        orderId,
        status: newStatus,
      },
    });

    // Fire-and-forget: notify user of status change
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        userId: true,
        tenantId: true,
        orderNo: true,
        totalAmount: true,
        pickupNo: true,
        storeId: true,
      },
    });

    if (updatedOrder) {
      if (newStatus === 'cooking') {
        this.notify
          .notifyOrderCooking(updatedOrder.userId, updatedOrder.tenantId, {
            orderNo: updatedOrder.orderNo,
            store: { name: '校园订餐' },
          })
          .catch((err) =>
            this.logger.error(
              `[Notify] 开始制作通知发送失败: ${(err as Error).message}`,
            ),
          );
      } else if (newStatus === 'ready') {
        this.notify
          .notifyOrderReady(updatedOrder.userId, updatedOrder.tenantId, {
            orderNo: updatedOrder.orderNo,
            pickupNo: updatedOrder.pickupNo ?? undefined,
            store: { name: '校园订餐' },
          })
          .catch((err) =>
            this.logger.error(
              `[Notify] 备餐完成通知发送失败: ${(err as Error).message}`,
            ),
          );
      } else if (newStatus === 'cancelled' && _reason) {
        // Merchant cancelled with reason — notify user with dedicated template
        this.notify
          .notifyOrderCancelled(updatedOrder.userId, updatedOrder.tenantId, {
            orderNo: updatedOrder.orderNo,
            reason: _reason,
          })
          .catch((err) =>
            this.logger.error(
              `[Notify] 订单取消通知发送失败: ${(err as Error).message}`,
            ),
          );
      }
    }

    // Fetch and return updated order
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  /** User cancels a pending order */
  async cancel(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }

    await this.prisma.$transaction(async (tx) => {
      // Atomically set status to cancelled only if still pending
      const result = await tx.order.updateMany({
        where: { id: orderId, status: 'pending' },
        data: { status: 'cancelled' },
      });

      if (result.count === 0) {
        throw new ConflictException('订单状态已变更，无法取消');
      }

      // Add timeline
      await tx.orderTimeline.create({
        data: { orderId, status: 'cancelled' },
      });

      // Restore stock
      for (const item of order.items) {
        await tx.sku.update({
          where: { id: item.skuId },
          data: {
            availableStock: { increment: item.quantity },
          },
        });
      }
    });

    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  /** Create new cart items from previous order items */
  async reorder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }

    // Create cart items from order items
    const cartItems = await this.prisma.$transaction(
      order.items.map((item) =>
        this.prisma.cartItem.create({
          data: {
            userId,
            tenantId: order.tenantId,
            skuId: item.skuId,
            quantity: item.quantity,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
          },
        }),
      ),
    );

    return cartItems;
  }

  /** User requests a refund (C-end). Creates RefundRecord for merchant approval. */
  async requestRefund(
    orderId: string,
    userId: string,
    items?: { orderItemId: string; quantity: number }[],
    reason?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== userId) throw new ForbiddenException('无权操作该订单');

    // Only allow refund for paid/confirmed/cooking/ready/picked statuses
    const refundableStatuses = [
      'paid',
      'confirmed',
      'cooking',
      'ready',
      'picked',
    ];
    if (!refundableStatuses.includes(order.status)) {
      throw new BadRequestException('当前订单状态不支持退款');
    }

    // Check max refund attempts
    const existingRefunds = await this.prisma.refundRecord.count({
      where: { orderId },
    });
    if (existingRefunds >= 2) {
      throw new BadRequestException('退款申请已达上限（2次）');
    }

    // Calculate refund amount (full or partial)
    const refundItems = items?.length
      ? order.items.filter((oi) => items.some((r) => r.orderItemId === oi.id))
      : order.items;
    const refundAmount = refundItems.reduce(
      (sum, oi) => sum + oi.price * oi.quantity,
      0,
    );

    const refund = await this.prisma.refundRecord.create({
      data: {
        orderId,
        amount: refundAmount,
        reason: reason || '用户申请退款',
        status: 'pending',
        paymentId: order.id, // Link to payment record if available
      },
    });

    // Update order status to refunding
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'refunding' },
    });

    return refund;
  }

  /** Add urge tag to order */
  async urge(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('无权操作该订单');
    }

    const existingTags: any = (order.tags as any) || {};
    const urgeCount = (existingTags.urgeCount || 0) + 1;
    const updatedTags = {
      ...existingTags,
      urgeCount,
      lastUrgeAt: new Date().toISOString(),
    };

    await this.prisma.order.update({
      where: { id: orderId },
      data: { tags: updatedTags },
    });

    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
      },
    });
  }

  /** Merchant replies to urge — clears urge tag and notifies user */
  async replyUrge(
    orderId: string,
    estimatedMinutes?: number,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        tenantId: true,
        orderNo: true,
        tags: true,
        storeId: true,
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const existingTags: any = (order.tags as any) || {};
    if (!existingTags.urgeCount || existingTags.urgeCount <= 0) {
      return { replied: false, message: '该订单没有待回复的催单' };
    }

    // Clear urge and record reply
    const updatedTags = {
      ...existingTags,
      urgeCount: 0,
      lastUrgeReplyAt: new Date().toISOString(),
      estimatedMinutes: estimatedMinutes || null,
    };

    await this.prisma.order.update({
      where: { id: orderId },
      data: { tags: updatedTags },
    });

    // Fire-and-forget: notify user of urge reply
    this.notify
      .notifyUrgeReply(order.userId, order.tenantId, {
        orderNo: order.orderNo,
        estimatedMinutes,
      })
      .catch((err) =>
        this.logger.error(
          `[Notify] 催单回复通知发送失败: ${(err as Error).message}`,
        ),
      );

    return { replied: true, orderNo: order.orderNo, estimatedMinutes };
  }

  /** Batch confirm orders (paid → confirmed) with transaction */
  async batchConfirm(storeId: string, orderIds: string[], operatorId: string) {
    const results: any[] = [];
    const errors: any[] = [];

    // Process in transaction for atomicity
    await this.prisma.$transaction(async (tx) => {
      for (const orderId of orderIds) {
        try {
          const order = await tx.order.findUnique({
            where: { id: orderId },
          });

          if (!order || order.storeId !== storeId) {
            errors.push({ orderId, error: '订单不存在或不属于该门店' });
            continue;
          }

          if (order.status !== 'paid') {
            errors.push({
              orderId,
              error: `订单状态为 ${order.status}，无法接单`,
            });
            continue;
          }

          // Update with optimistic lock inside transaction
          const result = await tx.order.updateMany({
            where: { id: orderId, version: order.version, status: 'paid' },
            data: { status: 'confirmed', version: { increment: 1 } },
          });

          if (result.count === 0) {
            errors.push({ orderId, error: '订单已被修改，请刷新后重试' });
            continue;
          }

          await tx.orderTimeline.create({
            data: { orderId, status: 'confirmed' },
          });

          results.push({ orderId, status: 'confirmed' });
        } catch (err: any) {
          errors.push({ orderId, error: err.message });
        }
      }
    });

    return { results, errors };
  }

  /** Generate next pickup number for a store (auto-increment: A001, A002...) */
  async generatePickupNo(storeId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find the latest order today for this store that has a pickupNo
      const lastOrder = await tx.order.findFirst({
        where: {
          storeId,
          pickupNo: { not: null },
          updatedAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        orderBy: { pickupNo: 'desc' },
        select: { pickupNo: true },
      });

      let nextNum = 1;
      if (lastOrder?.pickupNo) {
        const match = lastOrder.pickupNo.match(/^A(\d+)$/);
        if (match) {
          nextNum = parseInt(match[1], 10) + 1;
        }
      }

      return `A${nextNum.toString().padStart(3, '0')}`;
    });
  }

  /** Approve or reject a refund */
  async approveRefund(
    orderId: string,
    approved: boolean,
    operatorId: string,
    reason?: string,
  ) {
    const refund = await this.prisma.refundRecord.findFirst({
      where: { orderId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    if (!refund) {
      throw new NotFoundException('未找到待处理的退款申请');
    }

    // If rejected, just update the record and return
    if (!approved) {
      return this.prisma.refundRecord.update({
        where: { id: refund.id },
        data: {
          status: 'rejected',
          approvedBy: operatorId,
          rejectedReason: reason || '审核不通过',
        },
      });
    }

    // Approved: execute refund first (payment.refund uses upsert to update the record)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    // 1. Execute real refund — uses user's original reason, not admin note
    try {
      await this.payment.refund(orderId, refund.amount, refund.reason ?? undefined);
    } catch (err) {
      this.logger.error(
        `[approveRefund] 退款执行失败 order=${orderId}: ${(err as Error).message}`,
      );
      throw err;
    }

    // 2. Record the approver on the now-updated refund record
    const updatedRefund = await this.prisma.refundRecord.update({
      where: { id: refund.id },
      data: { approvedBy: operatorId },
    });

    // 3. Restore inventory
    await this.prisma.$transaction(
      order.items.map((item) =>
        this.prisma.sku.update({
          where: { id: item.skuId },
          data: {
            availableStock: { increment: item.quantity },
          },
        }),
      ),
    );

    // 4. Fire-and-forget: notify user of refund approval
    this.notify
      .notifyRefundApproved(order.userId, order.tenantId, {
        orderNo: order.orderNo,
        totalAmount: refund.amount,
      })
      .catch((err) =>
        this.logger.error(
          `[Notify] 退款通知发送失败: ${(err as Error).message}`,
        ),
      );

    return updatedRefund;
  }

  /** Merchant: get order detail */
  async findOneForMerchant(orderId: string, _tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
        payments: true,
        refunds: true,
        user: {
          select: { id: true, nickname: true, avatar: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }
}
