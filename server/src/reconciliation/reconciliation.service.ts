import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merchant dashboard — today's key metrics.
   */
  async getDashboard(storeId: string, tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const where = {
      storeId,
      tenantId,
      createdAt: { gte: today, lt: tomorrow },
    };

    // Aggregate revenue from paid/confirmed/cooking/ready/picked orders
    const revenueResult = await this.prisma.order.aggregate({
      where: {
        ...where,
        status: { in: ['paid', 'confirmed', 'cooking', 'ready', 'picked'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    const todayRevenue = revenueResult._sum.totalAmount || 0;
    const todayOrders = revenueResult._count || 0;

    // Avg order value
    const avgOrderValue =
      todayOrders > 0 ? Math.round(todayRevenue / todayOrders) : 0;

    // Pending orders: unpaid or merchant-confirmed but not yet cooking
    const pendingOrders = await this.prisma.order.count({
      where: { ...where, status: { in: ['pending', 'confirmed'] } },
    });

    // Top 10 dishes by quantity
    const topDishesRaw = await this.prisma.orderItem.groupBy({
      by: ['dishName'],
      where: {
        order: {
          storeId,
          tenantId,
          createdAt: { gte: today, lt: tomorrow },
          status: { in: ['paid', 'confirmed', 'cooking', 'ready', 'picked'] },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const topDishes = topDishesRaw.map((d) => ({
      name: d.dishName,
      quantity: d._sum.quantity || 0,
    }));

    // Refund amount today
    const refundResult = await this.prisma.refundRecord.aggregate({
      where: {
        order: { storeId, tenantId },
        createdAt: { gte: today, lt: tomorrow },
        status: 'completed',
      },
      _sum: { amount: true },
    });
    const todayRefund = refundResult._sum.amount || 0;

    // Week aggregation (past 7 days inclusive)
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekResult = await this.prisma.order.aggregate({
      where: {
        storeId,
        tenantId,
        createdAt: { gte: weekStart, lt: tomorrow },
        status: { in: ['paid', 'confirmed', 'cooking', 'ready', 'picked'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    });
    const weekRevenue = weekResult._sum.totalAmount || 0;
    const weekOrders = weekResult._count || 0;

    // Yesterday comparison
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yestResult = await this.prisma.order.aggregate({
      where: {
        storeId,
        tenantId,
        createdAt: { gte: yesterday, lt: today },
        status: { in: ['paid', 'confirmed', 'cooking', 'ready', 'picked'] },
      },
      _sum: { totalAmount: true },
      _count: true,
    });
    const yesterdayRevenue = yestResult._sum.totalAmount || 0;
    const yesterdayOrders = yestResult._count || 0;

    const revenueChange =
      yesterdayRevenue > 0
        ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
        : 0;
    const orderChange =
      yesterdayOrders > 0
        ? Math.round(((todayOrders - yesterdayOrders) / yesterdayOrders) * 1000) / 10
        : 0;

    return {
      todayRevenue,
      todayOrders,
      avgOrderValue,
      todayRefund,
      pendingOrders,
      topDishes,
      weekRevenue,
      weekOrders,
      yesterdayRevenue,
      yesterdayOrders,
      revenueChange,
      orderChange,
    };
  }

  /**
   * Daily reconciliation — compare system totals against WeChat payment totals.
   */
  async getReconciliation(
    storeId: string,
    tenantId: string,
    date: string,
  ) {
    const day = new Date(date);
    if (isNaN(day.getTime())) {
      return { error: '日期格式无效，请使用 YYYY-MM-DD' };
    }
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    // System total: sum of successful payment records for this day
    const systemResult = await this.prisma.paymentRecord.aggregate({
      where: {
        status: 'success',
        channel: 'wechat',
        createdAt: { gte: day, lt: nextDay },
        order: { storeId, tenantId },
      },
      _sum: { amount: true },
    });
    const systemTotal = systemResult._sum.amount || 0;

    // WeChat total: sum of payment records with a transactionId (confirmed by WeChat)
    const wechatResult = await this.prisma.paymentRecord.aggregate({
      where: {
        status: 'success',
        channel: 'wechat',
        transactionId: { not: null },
        createdAt: { gte: day, lt: nextDay },
        order: { storeId, tenantId },
      },
      _sum: { amount: true },
    });
    const wechatTotal = wechatResult._sum.amount || 0;

    const difference = systemTotal - wechatTotal;

    // Detail breakdown: per-order payment records
    const details = await this.prisma.paymentRecord.findMany({
      where: {
        status: 'success',
        channel: 'wechat',
        createdAt: { gte: day, lt: nextDay },
        order: { storeId, tenantId },
      },
      select: {
        id: true,
        amount: true,
        transactionId: true,
        createdAt: true,
        order: {
          select: { orderNo: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      date,
      systemTotal,
      wechatTotal,
      difference,
      matched: difference === 0,
      detailCount: details.length,
      details: details.map((d) => ({
        paymentId: d.id,
        orderNo: d.order?.orderNo || 'N/A',
        amount: d.amount,
        transactionId: d.transactionId,
        time: d.createdAt,
      })),
    };
  }
}
