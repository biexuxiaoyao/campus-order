import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RechargeDto } from './dto/recharge.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { PaginatedResponse } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { WechatPayConfig } from '../payment/wechat-pay.config';
import { WechatPayClient } from '../payment/wechat-pay.client';

@Injectable()
export class PrepaidService {
  private readonly logger = new Logger(PrepaidService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatConfig: WechatPayConfig,
    private readonly wechatPay: WechatPayClient,
  ) {
    this.baseUrl =
      process.env.API_BASE_URL ||
      `http://localhost:${process.env.PORT || 3000}`;
  }

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
   * 充值 — 创建 pending 充值流水 + pending 支付记录，不直接增加余额
   *
   * 余额仅在微信支付回调确认成功后才增加（通过 confirmRecharge）。
   * 微信已配置时调用真实 JSAPI 下单；未配置时返回 mock 参数供开发调试。
   */
  async recharge(userId: string, tenantId: string, dto: RechargeDto) {
    const amountInFen = dto.amount * 100;

    // Fetch user openid for WeChat JSAPI
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { openid: true },
    });
    if (!user?.openid && this.wechatConfig.isConfigured) {
      throw new BadRequestException('未获取到微信 openid，请重新登录');
    }

    const account = await this._getOrCreateAccount(userId, tenantId, dto.type);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 创建 pending 充值流水（余额未增加，balanceAfter = 当前余额）
      const txn = await tx.prepaidTransaction.create({
        data: {
          accountId: account.id,
          type: 'purchase',
          amount: amountInFen,
          balanceAfter: account.balance, // 当前余额，未增加
          channel: 'wechat',
          status: 'pending',
        },
      });

      // 2. 创建 pending 支付记录（无关联订单）
      const paymentRecord = await tx.paymentRecord.create({
        data: {
          orderId: null,
          amount: amountInFen,
          channel: 'wechat',
          status: 'pending',
        },
      });

      // 3. 关联充值流水与支付记录
      await tx.prepaidTransaction.update({
        where: { id: txn.id },
        data: { paymentRecordId: paymentRecord.id },
      });

      return {
        transactionId: txn.id,
        paymentRecordId: paymentRecord.id,
      };
    });

    // If WeChat is configured, call real JSAPI
    if (this.wechatConfig.isConfigured) {
      try {
        const jsapiParams = await this.createRechargeJsapiOrder(
          result.paymentRecordId,
          amountInFen,
          user!.openid,
        );
        return {
          transactionId: result.transactionId,
          paymentRecordId: result.paymentRecordId,
          paymentParams: jsapiParams,
        };
      } catch (err) {
        this.logger.error(
          `[recharge] 微信 JSAPI 下单失败: ${(err as Error).message}`,
        );
        throw new BadRequestException(
          '充值下单失败，请稍后重试',
        );
      }
    }

    // Mock fallback for dev
    return {
      transactionId: result.transactionId,
      paymentRecordId: result.paymentRecordId,
      paymentParams: {
        timeStamp: String(Math.floor(Date.now() / 1000)),
        nonceStr: this.wechatPay.generateNonceStr(),
        package: 'prepay_id=mock_prepay_' + result.transactionId,
        signType: 'RSA',
        paySign: 'MOCK_SIGN_DEV_ONLY',
      },
    };
  }

  /**
   * Call WeChat JSAPI to create a recharge prepay order.
   * Returns JSAPI params for wx.requestPayment.
   */
  private async createRechargeJsapiOrder(
    paymentRecordId: string,
    amountInFen: number,
    openid: string,
  ) {
    const outTradeNo = `RECHARGE_${paymentRecordId}`;
    const notifyUrl = `${this.baseUrl}/api/payment/notify`;

    const prepayRequest = {
      appid: this.wechatPay.getAppId(),
      mchid: this.wechatConfig.mchId,
      description: '账户充值',
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      amount: {
        total: amountInFen,
        currency: 'CNY',
      },
      payer: {
        openid,
      },
    };

    const prepayResponse = await this.wechatPay.callWechatApi<{ prepay_id: string }>(
      'POST',
      '/v3/pay/transactions/jsapi',
      prepayRequest,
    );

    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = this.wechatPay.generateNonceStr();
    const pkg = `prepay_id=${prepayResponse.prepay_id}`;

    const paySign = this.wechatPay.generateWechatSign({
      appId: this.wechatPay.getAppId(),
      timeStamp,
      nonceStr,
      package: pkg,
    });

    if (!paySign) {
      throw new BadRequestException('生成支付签名失败：私钥未配置');
    }

    return {
      appId: this.wechatPay.getAppId(),
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
    };
  }

  /**
   * 确认充值 — 支付回调成功后调用
   *
   * 在 $transaction 内原子执行：
   *   1. 查找 pending 充值流水
   *   2. 增加账户余额
   *   3. 更新充值流水为 completed
   *   4. 更新支付记录为 success
   */
  async confirmRecharge(paymentRecordId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 幂等检查：如果已处理，直接返回
      const existingTxn = await tx.prepaidTransaction.findFirst({
        where: { paymentRecordId, status: 'completed', type: 'purchase' },
        include: { account: true },
      });

      if (existingTxn) {
        return {
          transactionId: existingTxn.id,
          accountId: existingTxn.accountId,
          balanceAfter: existingTxn.balanceAfter,
          idempotent: true,
        };
      }

      // 查找 pending 充值流水
      const pendingTxn = await tx.prepaidTransaction.findFirst({
        where: { paymentRecordId, status: 'pending', type: 'purchase' },
        include: { account: true },
      });

      if (!pendingTxn) {
        throw new BadRequestException('未找到待确认的充值记录');
      }

      // 原子增加余额
      const updatedAccount = await tx.prepaidAccount.update({
        where: { id: pendingTxn.accountId },
        data: { balance: { increment: pendingTxn.amount } },
      });

      // 更新充值流水状态
      await tx.prepaidTransaction.update({
        where: { id: pendingTxn.id },
        data: {
          status: 'completed',
          balanceAfter: updatedAccount.balance,
        },
      });

      // 更新支付记录状态
      await tx.paymentRecord.update({
        where: { id: paymentRecordId },
        data: { status: 'success' },
      });

      return {
        transactionId: pendingTxn.id,
        accountId: pendingTxn.accountId,
        balanceAfter: updatedAccount.balance,
        idempotent: false,
      };
    });
  }

  /**
   * 消费扣款（供 PaymentService 在同一个事务中调用）
   *
   * 幂等：同一 orderId 重复调用不会重复扣款。
   */
  async consumeWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    accountType: 'personal' | 'company',
    amount: number,
    orderId: string,
  ): Promise<{ balanceAfter: number; transactionId: string }> {
    // 幂等检查：同一订单的消费流水已存在则直接返回
    const channel = `order_${orderId}`;
    const existingTxn = await tx.prepaidTransaction.findFirst({
      where: { channel, type: 'consume', status: 'completed' },
    });
    if (existingTxn) {
      return {
        balanceAfter: existingTxn.balanceAfter,
        transactionId: existingTxn.id,
      };
    }

    const account = await this._getOrCreateAccountWithTx(
      tx,
      userId,
      tenantId,
      accountType,
    );

    // 原子扣减余额（余额不足时 updateMany.count === 0）
    const updated = await tx.prepaidAccount.updateMany({
      where: { id: account.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (updated.count === 0) {
      throw new BadRequestException('账户余额不足');
    }

    const newAccount = await tx.prepaidAccount.findUnique({
      where: { id: account.id },
    });

    const txn = await tx.prepaidTransaction.create({
      data: {
        accountId: account.id,
        type: 'consume',
        amount,
        balanceAfter: newAccount!.balance,
        channel,
        status: 'completed',
      },
    });

    return {
      balanceAfter: newAccount!.balance,
      transactionId: txn.id,
    };
  }

  /**
   * 消费扣款（独立调用，自动开启事务）
   *
   * 幂等：同一 orderId 重复调用不会重复扣款。
   */
  async consume(
    userId: string,
    tenantId: string,
    accountType: 'personal' | 'company',
    amount: number,
    orderId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      return this.consumeWithTx(
        tx,
        userId,
        tenantId,
        accountType,
        amount,
        orderId,
      );
    });
  }

  /**
   * 退款 — 退还至个人账户
   *
   * @param referenceId 幂等键（如订单号或退款记录ID），同一 referenceId 不会重复退款
   */
  async refund(
    userId: string,
    tenantId: string,
    amount: number,
    reason?: string,
    referenceId?: string,
  ) {
    // 幂等检查
    if (referenceId) {
      const channel = `refund:${referenceId}`;
      const existingTxn = await this.prisma.prepaidTransaction.findFirst({
        where: { channel, type: 'refund', status: 'completed' },
      });
      if (existingTxn) {
        return {
          balanceAfter: existingTxn.balanceAfter,
          idempotent: true,
        };
      }
    }

    const account = await this._getOrCreateAccount(
      userId,
      tenantId,
      'personal',
    );

    const channelStr = referenceId
      ? `refund:${referenceId}`
      : reason
        ? `reason:${reason}`
        : undefined;

    const [transaction] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prepaidAccount.update({
        where: { id: account.id },
        data: { balance: { increment: amount } },
      });
      const txn = await tx.prepaidTransaction.create({
        data: {
          accountId: account.id,
          type: 'refund',
          amount,
          balanceAfter: updated.balance,
          channel: channelStr,
          status: 'completed',
        },
      });
      return [txn];
    });

    return {
      balanceAfter: transaction.balanceAfter,
      idempotent: false,
    };
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

  private async _getOrCreateAccountWithTx(
    tx: Prisma.TransactionClient,
    userId: string,
    tenantId: string,
    type: 'personal' | 'company',
  ) {
    let account = await tx.prepaidAccount.findUnique({
      where: { userId_type: { userId, type } },
    });

    if (!account) {
      account = await tx.prepaidAccount.create({
        data: { userId, tenantId, type },
      });
    }

    return account;
  }

}
