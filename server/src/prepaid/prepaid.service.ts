import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RechargeDto } from './dto/recharge.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class PrepaidService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取或创建个人 + 企业两个充值账户，返回各自的余额
   */
  async getBalance(userId: string, tenantId: string) {
    const [personal, company] = await Promise.all([
      this._getOrCreateAccount(userId, tenantId, 'personal'),
      this._getOrCreateAccount(userId, tenantId, 'company'),
    ]);

    return {
      personalBalance: personal.balance,
      companyBalance: company.balance,
    };
  }

  /**
   * 充值 — 创建 purchase 流水，增加账户余额
   */
  async recharge(userId: string, tenantId: string, dto: RechargeDto) {
    const amountInFen = dto.amount * 100;

    const account = await this._getOrCreateAccount(userId, tenantId, dto.type);

    const balanceAfter = account.balance + amountInFen;

    const [transaction] = await this.prisma.$transaction([
      this.prisma.prepaidTransaction.create({
        data: {
          accountId: account.id,
          type: 'purchase',
          amount: amountInFen,
          balanceAfter,
          channel: 'wechat',
        },
      }),
      this.prisma.prepaidAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      }),
    ]);

    // 返回模拟支付参数（后续对接微信支付）
    return {
      transactionId: transaction.id,
      paymentParams: {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: this._randomStr(32),
        package: 'prepay_id=mock_prepay_' + transaction.id,
        signType: 'MD5',
        paySign: this._randomStr(32).toUpperCase(),
      },
    };
  }

  /**
   * 消费扣款 — 从指定类型账户扣减余额
   */
  async consume(
    userId: string,
    tenantId: string,
    accountType: 'personal' | 'company',
    amount: number,
    orderId: string,
  ) {
    const account = await this._getOrCreateAccount(userId, tenantId, accountType);

    if (account.balance < amount) {
      throw new BadRequestException('账户余额不足');
    }

    const balanceAfter = account.balance - amount;

    await this.prisma.$transaction([
      this.prisma.prepaidTransaction.create({
        data: {
          accountId: account.id,
          type: 'consume',
          amount,
          balanceAfter,
          channel: `order_${orderId}`,
        },
      }),
      this.prisma.prepaidAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      }),
    ]);

    return { balanceAfter };
  }

  /**
   * 退款 — 退还至个人账户
   */
  async refund(
    userId: string,
    tenantId: string,
    amount: number,
    reason?: string,
  ) {
    const account = await this._getOrCreateAccount(userId, tenantId, 'personal');

    const balanceAfter = account.balance + amount;

    await this.prisma.$transaction([
      this.prisma.prepaidTransaction.create({
        data: {
          accountId: account.id,
          type: 'refund',
          amount,
          balanceAfter,
          channel: reason ? `reason:${reason}` : undefined,
        },
      }),
      this.prisma.prepaidAccount.update({
        where: { id: account.id },
        data: { balance: balanceAfter },
      }),
    ]);

    return { balanceAfter };
  }

  /**
   * 分页查询交易流水，支持按类型筛选
   */
  async getTransactions(
    userId: string,
    tenantId: string,
    query: QueryTransactionDto,
  ): Promise<PaginatedResponse<any>> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // 获取该用户在此租户下的所有充值账户
    const accounts = await this.prisma.prepaidAccount.findMany({
      where: { userId, tenantId },
      select: { id: true },
    });

    const accountIds = accounts.map((a) => a.id);

    if (accountIds.length === 0) {
      return { items: [], total: 0, hasMore: false };
    }

    const where: any = {
      accountId: { in: accountIds },
    };

    if (query.type) {
      where.type = query.type;
    }

    const [items, total] = await Promise.all([
      this.prisma.prepaidTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          account: { select: { type: true } },
        },
      }),
      this.prisma.prepaidTransaction.count({ where }),
    ]);

    return {
      items,
      total,
      hasMore: skip + pageSize < total,
    };
  }

  // ---------- private ----------

  private async _getOrCreateAccount(
    userId: string,
    tenantId: string,
    type: 'personal' | 'company',
  ) {
    let account = await this.prisma.prepaidAccount.findUnique({
      where: { userId_type: { userId, type } },
    });

    if (!account) {
      account = await this.prisma.prepaidAccount.create({
        data: { userId, tenantId, type },
      });
    }

    return account;
  }

  private _randomStr(len: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
