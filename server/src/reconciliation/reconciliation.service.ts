import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WechatPayConfig } from '../payment/wechat-pay.config';
import { WechatPayClient } from '../payment/wechat-pay.client';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatConfig: WechatPayConfig,
    private readonly wechatPay: WechatPayClient,
  ) {}

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

    // Attempt to fetch real WeChat bill for comparison (when configured)
    let wechatBillTotal: number | null = null;
    let billSource = 'local';
    if (this.wechatConfig.isConfigured) {
      try {
        wechatBillTotal = await this.fetchWechatBillTotal(date);
        billSource = 'wechat_api';
        this.logger.log(
          `[Reconciliation] 微信对账单获取成功 date=${date} total=${wechatBillTotal}`,
        );
      } catch (err) {
        this.logger.warn(
          `[Reconciliation] 微信对账单获取失败，回退到本地比对: ${(err as Error).message}`,
        );
      }
    }

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
      wechatTotal: wechatBillTotal ?? wechatTotal,
      difference: wechatBillTotal != null ? systemTotal - wechatBillTotal : difference,
      matched: wechatBillTotal != null ? systemTotal === wechatBillTotal : difference === 0,
      billSource,
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

  /**
   * Fetch real WeChat bill total for a given date.
   * Calls /v3/bill/tradebill to get the download URL, then fetches and parses the CSV.
   */
  private async fetchWechatBillTotal(date: string): Promise<number> {
    // Step 1: Request bill download URL from WeChat
    const billResponse = await this.wechatPay.callWechatApi<{
      download_url: string;
      hash_type: string;
      hash_value: string;
    }>('GET', `/v3/bill/tradebill?bill_date=${date.replace(/-/g, '')}`, null);

    if (!billResponse?.download_url) {
      throw new Error('微信未返回对账单下载链接');
    }

    // Step 2: Download the bill CSV
    const csvContent = await this.downloadBillCsv(billResponse.download_url);

    // Step 3: Parse CSV and sum successful payments
    return this.parseWechatBillTotal(csvContent);
  }

  /** Download bill CSV from WeChat-provided URL */
  private async downloadBillCsv(url: string): Promise<string> {
    // Use the same HTTP infrastructure as WechatPayClient via a simple fetch
    const https = await import('https');
    return new Promise((resolve, reject) => {
      https
        .get(url, (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        })
        .on('error', reject);
    });
  }

  /**
   * Parse WeChat bill CSV to extract total successful payment amount.
   * WeChat bill format: header row + detail rows with columns:
   * trade_time, appid, mchid, sub_mchid, device_info, transaction_id,
   * out_trade_no, openid, trade_type, trade_state, bank_type, fee_type,
   * total_fee, coupon_fee, refund_fee, ...
   * Total row starts with `总交易单数`.
   */
  private parseWechatBillTotal(csv: string): number {
    const lines = csv.split('\n').filter((l) => l.trim());
    let total = 0;

    for (const line of lines) {
      if (line.startsWith('总交易单数') || line.startsWith('合计')) {
        // Parse the summary row: columns include total fee
        const cols = line.split(',');
        // Total fee is typically the 13th column (index 12) in the summary row
        const feeCol = cols.find((c) => /^\d+\.?\d*$/.test(c.trim()));
        if (feeCol) {
          // WeChat returns amounts in yuan with decimals; convert to fen
          const yuan = parseFloat(feeCol.trim());
          if (!isNaN(yuan)) {
            return Math.round(yuan * 100);
          }
        }
      } else if (
        line.startsWith('`') ||
        line.startsWith('交易时间') ||
        line.trim() === ''
      ) {
        // Skip header and empty lines
        continue;
      } else {
        // Detail row: sum successful payments (trade_state = SUCCESS)
        const cols = this.parseCsvLineRaw(line);
        const tradeState = cols[9]?.trim();
        const totalFee = parseFloat(cols[12]?.trim() || '0');
        if (
          (tradeState === 'SUCCESS' || tradeState === 'REFUND') &&
          !isNaN(totalFee)
        ) {
          // SUCCESS = positive (payment), REFUND = negative (refund)
          total += tradeState === 'SUCCESS' ? totalFee : -totalFee;
        }
      }
    }

    return Math.round(total * 100); // Convert yuan to fen
  }

  /** Parse a single CSV line into columns (handles quoted fields with commas) */
  private parseCsvLineRaw(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    // Remove leading backtick if present (WeChat CSV format)
    const clean = line.startsWith('`') ? line.slice(1) : line;

    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }
}
