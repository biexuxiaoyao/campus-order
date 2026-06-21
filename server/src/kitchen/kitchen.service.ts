import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';

/** Valid status transitions for kitchen operations */
const KITCHEN_TRANSITIONS: Record<string, { target: string; label: string }> =
  {
    confirmed: { target: 'cooking', label: '开始制作' },
    cooking: { target: 'ready', label: '完成备餐' },
    ready: { target: 'picked', label: '已取餐' },
  };

@Injectable()
export class KitchenService {
  private readonly logger = new Logger(KitchenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  /**
   * Get orders grouped by status for the kitchen display board.
   * Returns today's orders in three groups: pending/confirmed, cooking, ready.
   */
  async getKitchenOrders(storeId: string, tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        storeId,
        tenantId,
        createdAt: { gte: today },
        status: { in: ['confirmed', 'cooking', 'ready'] },
      },
      include: {
        items: {
          select: {
            id: true,
            skuId: true,
            dishName: true,
            specName: true,
            price: true,
            quantity: true,
          },
        },
        timeline: { orderBy: { timestamp: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Sort urged orders to the top within each group
    const sortByUrge = (a: any, b: any) => {
      const urgeA = a.tags?.urgeCount || 0;
      const urgeB = b.tags?.urgeCount || 0;
      if (urgeB !== urgeA) return urgeB - urgeA;
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    };

    const pending = orders
      .filter((o) => o.status === 'confirmed')
      .sort(sortByUrge);
    const cooking = orders
      .filter((o) => o.status === 'cooking')
      .sort(sortByUrge);
    const ready = orders
      .filter((o) => o.status === 'ready')
      .sort(sortByUrge);

    return {
      pending,
      pendingCount: pending.length,
      cooking,
      cookingCount: cooking.length,
      ready,
      readyCount: ready.length,
      total: orders.length,
    };
  }

  /**
   * Batch transition: confirmed → cooking (with notification)
   */
  async batchStartCooking(
    storeId: string,
    orderIds: string[],
    _operatorId: string,
  ) {
    const result = await this.batchTransition(storeId, orderIds, 'confirmed', 'cooking');
    await this.notifyBatchResult(result, 'cooking');
    return result;
  }

  /**
   * Batch transition: cooking → ready (generates pickupNo, with notification)
   */
  async batchMarkReady(
    storeId: string,
    orderIds: string[],
    _operatorId: string,
  ) {
    const result = await this.batchTransition(storeId, orderIds, 'cooking', 'ready');
    await this.notifyBatchResult(result, 'ready');
    return result;
  }

  /**
   * Batch transition: ready → picked (with pickup notification)
   */
  async batchPickup(
    storeId: string,
    orderIds: string[],
    _operatorId: string,
  ) {
    const result = await this.batchTransition(storeId, orderIds, 'ready', 'picked');
    await this.notifyBatchResult(result, 'picked');
    return result;
  }

  /** Fire-and-forget notifications for batch transitions */
  private async notifyBatchResult(
    result: { results: { orderId: string; pickupNo?: string }[] },
    toStatus: string,
  ) {
    const orderIds = result.results.map((r) => r.orderId);
    if (orderIds.length === 0) return;

    // Batch-fetch all orders at once (avoids N+1)
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, userId: true, tenantId: true, orderNo: true },
    });
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    // Build pickupNo map from batchTransition results
    const pickupNoMap = new Map<string, string>();
    for (const r of result.results) {
      if (r.pickupNo) pickupNoMap.set(r.orderId, r.pickupNo);
    }

    for (const r of result.results) {
      const order = orderMap.get(r.orderId);
      if (!order) continue;

      let notifyPromise: Promise<void>;
      switch (toStatus) {
        case 'cooking':
          notifyPromise = this.notify.notifyOrderCooking(
            order.userId,
            order.tenantId,
            { orderNo: order.orderNo, store: { name: '校园订餐' } },
          );
          break;
        case 'ready':
          notifyPromise = this.notify.notifyOrderReady(
            order.userId,
            order.tenantId,
            {
              orderNo: order.orderNo,
              pickupNo: pickupNoMap.get(r.orderId),
              store: { name: '校园订餐' },
            },
          );
          break;
        case 'picked':
          notifyPromise = this.notify.notifyOrderPicked(
            order.userId,
            order.tenantId,
            { orderNo: order.orderNo, store: { name: '校园订餐' } },
          );
          break;
        default:
          this.logger.warn(
            `[Notify] 未知状态 ${toStatus}，跳过通知 order=${order.orderNo}`,
          );
          continue;
      }

      notifyPromise.catch((err) =>
        this.logger.error(
          `[Notify] ${toStatus} 通知发送失败 order=${order.orderNo}: ${(err as Error).message}`,
        ),
      );
    }
  }

  /**
   * Generic batch status transition with optimistic locking.
   * Partially updates: valid orders succeed, invalid ones are reported as errors.
   */
  private async batchTransition(
    storeId: string,
    orderIds: string[],
    fromStatus: string,
    toStatus: string,
  ) {
    const results: any[] = [];
    const errors: any[] = [];

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

          if (order.status !== fromStatus) {
            errors.push({
              orderId,
              error: `订单状态为 ${order.status}，无法${KITCHEN_TRANSITIONS[fromStatus]?.label || '操作'}`,
            });
            continue;
          }

          // Build update data
          const updateData: any = { status: toStatus };

          // Generate pickupNo when moving to ready (offset prevents same-batch duplicates)
          if (toStatus === 'ready') {
            const pickupNo = await this.generatePickupNo(tx, storeId);
            updateData.pickupNo = pickupNo;
          }

          // Optimistic lock
          const result = await tx.order.updateMany({
            where: { id: orderId, version: order.version, status: fromStatus },
            data: { ...updateData, version: { increment: 1 } },
          });

          if (result.count === 0) {
            errors.push({ orderId, error: '订单已被修改，请刷新后重试' });
            continue;
          }

          await tx.orderTimeline.create({
            data: { orderId, status: toStatus },
          });

          results.push({ orderId, status: toStatus, ...updateData });
        } catch (err: any) {
          errors.push({ orderId, error: err.message });
        }
      }

    });

    return { results, errors };
  }

  /**
   * Generate next pickup number for a store (auto-increment: A001, A002...)
   * Uses max-existing algorithm — matches order.service.ts to avoid conflicts.
   * Within a transaction, prior writes are visible so no offset is needed.
   */
  private async generatePickupNo(
    tx: any,
    storeId: string,
  ): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find the highest existing pickupNo for this store today
    const lastOrder = await tx.order.findFirst({
      where: {
        storeId,
        pickupNo: { not: null },
        updatedAt: { gte: today, lt: tomorrow },
      },
      orderBy: { pickupNo: 'desc' },
      select: { pickupNo: true },
    });

    let nextNum = 1;
    if (lastOrder?.pickupNo) {
      const match = (lastOrder.pickupNo as string).match(/^A(\d+)$/);
      if (match) {
        nextNum = parseInt(match[1], 10) + 1;
      }
    }

    return `A${nextNum.toString().padStart(3, '0')}`;
  }
}
