import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeDto } from './dto/exchange.dto';
import { PaginatedResponse } from '../common/dto/pagination.dto';

@Injectable()
export class PointsService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取积分摘要 — 不存在则自动创建
   */
  async getSummary(userId: string, tenantId: string) {
    const account = await this._getOrCreateAccount(userId, tenantId);
    return {
      balance: account.balance,
      totalEarned: account.totalEarned,
    };
  }

  /**
   * 每日签到
   * - 基础 10 积分 + 连续签到奖励（每天 +1，最高 +5）
   * - 当天已签到抛出 409
   */
  async signIn(userId: string, tenantId: string) {
    const todayMidnight = this._dayStart(new Date());
    const tomorrowMidnight = this._dayStart(
      new Date(todayMidnight.getTime() + 86400000),
    );

    // 检查今天是否已签到
    const todayRecord = await this.prisma.signInRecord.findFirst({
      where: {
        userId,
        tenantId,
        signDate: {
          gte: todayMidnight,
          lt: tomorrowMidnight,
        },
      },
    });

    if (todayRecord) {
      throw new ConflictException('今天已签到');
    }

    // 查询昨天的签到记录计算连续天数
    const yesterdayMidnight = this._dayStart(
      new Date(todayMidnight.getTime() - 86400000),
    );

    const yesterdayRecord = await this.prisma.signInRecord.findFirst({
      where: {
        userId,
        tenantId,
        signDate: {
          gte: yesterdayMidnight,
          lt: todayMidnight,
        },
      },
    });

    const consecutiveDays = yesterdayRecord
      ? yesterdayRecord.consecutiveDays + 1
      : 1;

    // 积分 = 10 + min(consecutiveDays - 1, 5)，范围 10~15
    const bonusPoints = Math.min(consecutiveDays - 1, 5);
    const totalPoints = 10 + bonusPoints;

    const account = await this._getOrCreateAccount(userId, tenantId);

    await this.prisma.$transaction([
      this.prisma.signInRecord.create({
        data: {
          userId,
          tenantId,
          signDate: todayMidnight,
          consecutiveDays,
        },
      }),
      this.prisma.pointsAccount.update({
        where: { id: account.id },
        data: {
          balance: account.balance + totalPoints,
          totalEarned: account.totalEarned + totalPoints,
        },
      }),
      this.prisma.pointsTransaction.create({
        data: {
          accountId: account.id,
          type: 'earn',
          points: totalPoints,
        },
      }),
    ]);

    return {
      earned: totalPoints,
      consecutiveDays,
      balance: account.balance + totalPoints,
    };
  }

  /**
   * 通用积分入账（供订单完成等逻辑调用）
   */
  async earnPoints(
    userId: string,
    tenantId: string,
    points: number,
    ruleId?: string,
  ) {
    if (points <= 0) {
      throw new BadRequestException('积分数量必须大于 0');
    }

    const account = await this._getOrCreateAccount(userId, tenantId);

    await this.prisma.$transaction([
      this.prisma.pointsAccount.update({
        where: { id: account.id },
        data: {
          balance: account.balance + points,
          totalEarned: account.totalEarned + points,
        },
      }),
      this.prisma.pointsTransaction.create({
        data: {
          accountId: account.id,
          type: 'earn',
          points,
          ruleId,
        },
      }),
    ]);

    return { balance: account.balance + points };
  }

  /**
   * 积分消耗
   */
  async consumePoints(
    userId: string,
    tenantId: string,
    points: number,
    description?: string,
  ) {
    if (points <= 0) {
      throw new BadRequestException('积分数量必须大于 0');
    }

    const account = await this._getOrCreateAccount(userId, tenantId);

    if (account.balance < points) {
      throw new BadRequestException('积分余额不足');
    }

    await this.prisma.$transaction([
      this.prisma.pointsAccount.update({
        where: { id: account.id },
        data: { balance: account.balance - points },
      }),
      this.prisma.pointsTransaction.create({
        data: {
          accountId: account.id,
          type: 'consume',
          points,
          ruleId: description,
        },
      }),
    ]);

    return { balance: account.balance - points };
  }

  /**
   * 积分兑换（桩实现，后续对接实物/优惠券系统）
   */
  async exchange(userId: string, _tenantId: string, dto: ExchangeDto) {
    if (dto.type === 'product') {
      return {
        success: true,
        message: '积分兑换商品功能开发中',
        productId: dto.productId,
      };
    }

    return {
      success: true,
      message: '积分兑换优惠券功能开发中',
      couponTemplateId: dto.couponTemplateId,
    };
  }

  /**
   * 分页查询积分流水
   */
  async getTransactions(
    userId: string,
    tenantId: string,
    query: { page?: number; pageSize?: number },
  ): Promise<PaginatedResponse<any>> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const account = await this.prisma.pointsAccount.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    if (!account) {
      return { items: [], total: 0, hasMore: false };
    }

    const where = { accountId: account.id };

    const [items, total] = await Promise.all([
      this.prisma.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.pointsTransaction.count({ where }),
    ]);

    return {
      items,
      total,
      hasMore: skip + pageSize < total,
    };
  }

  // ---------- private ----------

  private async _getOrCreateAccount(userId: string, tenantId: string) {
    let account = await this.prisma.pointsAccount.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    if (!account) {
      account = await this.prisma.pointsAccount.create({
        data: { userId, tenantId },
      });
    }

    return account;
  }

  private _dayStart(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }
}
