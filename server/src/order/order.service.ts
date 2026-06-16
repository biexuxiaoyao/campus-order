import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['confirmed'],
  confirmed: ['cooking'],
  cooking: ['ready'],
  ready: ['picked'],
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
  const entries = Object.entries(specs as Record<string, any>);
  return entries.map(([, v]) => v).join('/');
}

@Injectable()
export class OrderService {
  constructor(private prisma: PrismaService) {}

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
          throw new ConflictException(
            `SKU ${item.skuId} 库存扣减失败，请重试`,
          );
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
    operatorId: string,
    reason?: string,
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

    if (order.status !== 'pending') {
      throw new BadRequestException('只能取消待支付的订单');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update status to cancelled
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled' },
      });

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

  /** Batch confirm orders (paid → confirmed) */
  async batchConfirm(
    storeId: string,
    orderIds: string[],
    operatorId: string,
  ) {
    const results: any[] = [];
    const errors: any[] = [];

    for (const orderId of orderIds) {
      try {
        const order = await this.prisma.order.findUnique({
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

        const result = await this.updateStatus(
          orderId,
          'confirmed',
          operatorId,
        );
        results.push(result);
      } catch (err: any) {
        errors.push({ orderId, error: err.message });
      }
    }

    return { results, errors };
  }

  /** Generate next pickup number for a store (auto-increment: A001, A002...) */
  async generatePickupNo(storeId: string): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find the latest order today for this store that has a pickupNo
    const lastOrder = await this.prisma.order.findFirst({
      where: {
        storeId,
        pickupNo: { not: null },
        updatedAt: {
          gte: today,
          lt: tomorrow,
        },
      },
      orderBy: { updatedAt: 'desc' },
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

    const updatedRefund = await this.prisma.refundRecord.update({
      where: { id: refund.id },
      data: {
        status: approved ? 'approved' : 'rejected',
        approvedBy: approved ? operatorId : undefined,
        rejectedReason: approved ? undefined : reason || '审核不通过',
      },
    });

    // If approved, restore stock
    if (approved) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (order) {
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
      }
    }

    return updatedRefund;
  }

  /** Merchant: get order detail */
  async findOneForMerchant(orderId: string, tenantId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        timeline: { orderBy: { timestamp: 'asc' } },
        payments: true,
        refunds: true,
        user: { select: { id: true, nickname: true, avatar: true, phone: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    return order;
  }
}
