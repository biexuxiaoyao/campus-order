import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { firstValueFrom } from 'rxjs';
import type {
  NotifyScenario,
  SubscribeMessageData,
  SubscribeMessageResponse,
  AccessTokenResponse,
} from './notify.types';

/** 场景对应的模板 ID 默认 key（实际使用时从 BrandConfig 读取） */
const SCENARIO_TEMPLATE_KEYS: Record<NotifyScenario, string> = {
  order_paid: 'notifyTemplateOrderPaid',
  order_cooking: 'notifyTemplateOrderCooking',
  order_ready: 'notifyTemplateOrderReady',
  order_picked: 'notifyTemplateOrderPicked',
  refund_approved: 'notifyTemplateRefundApproved',
  group_success: 'notifyTemplateGroupSuccess',
  group_failed: 'notifyTemplateGroupFailed',
  coupon_expiring: 'notifyTemplateCouponExpiring',
};

@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly appId: string;
  private readonly appSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.appId = this.config.get<string>('WECHAT_APP_ID')!;
    this.appSecret = this.config.get<string>('WECHAT_APP_SECRET')!;
  }

  // ==================== 主发送方法 ====================

  /**
   * 发送订阅消息
   * @param userId   用户 ID
   * @param tenantId 租户 ID
   * @param scenario 通知场景
   * @param data     模板变量数据（key -> value）
   * @param page     可选跳转页面
   */
  async sendSubscribeMessage(
    userId: string,
    tenantId: string,
    scenario: NotifyScenario,
    data: Record<string, string>,
    page?: string,
  ): Promise<void> {
    // 1. 获取用户 openid
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { openid: true },
    });

    if (!user?.openid) {
      this.logger.warn(
        `[Notify] 用户 ${userId} 无 openid，跳过发送（scenario: ${scenario}）`,
      );
      return;
    }

    // 2. 获取模板 ID（从 BrandConfig 读取）
    const templateKey = SCENARIO_TEMPLATE_KEYS[scenario];
    const brandConfig = await this.prisma.brandConfig.findUnique({
      where: { tenantId },
    });

    const config = (brandConfig?.config as Record<string, unknown>) || {};
    const templateId = config[templateKey] as string | undefined;

    if (!templateId) {
      this.logger.warn(
        `[Notify] 租户 ${tenantId} 未配置场景 ${scenario} 的模板 ID（key: ${templateKey}），跳过发送`,
      );
      return;
    }

    // 3. 获取 access_token
    const accessToken = await this.getAccessToken(this.appId, this.appSecret);

    // 4. 构造消息体
    const messageData: Record<string, { value: string }> = {};
    for (const [key, value] of Object.entries(data)) {
      messageData[key] = { value };
    }

    const body: SubscribeMessageData = {
      touser: user.openid,
      template_id: templateId,
      page,
      data: messageData,
      miniprogram_state: 'formal',
    };

    // 5. 开发环境仅记录日志
    if (process.env.NODE_ENV === 'development') {
      this.logger.log(
        `[Notify] DEV — 模拟发送订阅消息:
  scenario: ${scenario}
  touser: ${user.openid}
  template_id: ${templateId}
  data: ${JSON.stringify(messageData)}
  page: ${page || '(无)'}`,
      );
      return;
    }

    // 6. 调用微信 API
    try {
      const response = await firstValueFrom(
        this.http.post<SubscribeMessageResponse>(
          `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
          body,
        ),
      );

      const result = response.data;

      if (result.errcode !== 0) {
        this.logger.error(
          `[Notify] 微信订阅消息发送失败: ${result.errmsg} (errcode: ${result.errcode})`,
        );
      } else {
        this.logger.log(
          `[Notify] 订阅消息发送成功 — scenario: ${scenario}, userId: ${userId}`,
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Notify] 发送订阅消息请求异常: ${message}`);
    }
  }

  // ==================== 场景快捷方法 ====================

  /** 订单支付成功通知 */
  async notifyOrderPaid(
    userId: string,
    tenantId: string,
    order: { orderNo: string; totalAmount: number; store?: { name?: string } },
  ): Promise<void> {
    const amountYuan = (order.totalAmount / 100).toFixed(2);
    await this.sendSubscribeMessage(userId, tenantId, 'order_paid', {
      thing1: order.orderNo,
      amount2: `${amountYuan} 元`,
      thing3: order.store?.name || '校园订餐',
    });
  }

  /** 备餐完成通知（含取餐号） */
  async notifyOrderReady(
    userId: string,
    tenantId: string,
    order: { orderNo: string; pickupNo?: string; store?: { name?: string } },
  ): Promise<void> {
    await this.sendSubscribeMessage(
      userId,
      tenantId,
      'order_ready',
      {
        thing1: order.orderNo,
        character_string2: order.pickupNo || '—',
        thing3: order.store?.name || '校园订餐',
      },
      `/pages/order/detail?id=${order.orderNo}`,
    );
  }

  /** 退款审批通过通知 */
  async notifyRefundApproved(
    userId: string,
    tenantId: string,
    order: { orderNo: string; totalAmount: number },
  ): Promise<void> {
    const amountYuan = (order.totalAmount / 100).toFixed(2);
    await this.sendSubscribeMessage(userId, tenantId, 'refund_approved', {
      thing1: order.orderNo,
      amount2: `${amountYuan} 元`,
      phrase3: '已通过',
    });
  }

  /** 团单结果通知（成功/失败） */
  async notifyGroupResult(
    userId: string,
    tenantId: string,
    groupOrder: { groupNo: string; storeName?: string },
    success: boolean,
  ): Promise<void> {
    await this.sendSubscribeMessage(
      userId,
      tenantId,
      success ? 'group_success' : 'group_failed',
      {
        thing1: groupOrder.groupNo,
        thing2: groupOrder.storeName || '校园订餐',
        phrase3: success ? '拼团成功' : '拼团失败',
      },
    );
  }

  /** 优惠券即将过期通知（批量） */
  async notifyCouponExpiring(
    userIds: string[],
    tenantId: string,
    couponName: string,
    expireDate: string,
  ): Promise<void> {
    for (const userId of userIds) {
      await this.sendSubscribeMessage(userId, tenantId, 'coupon_expiring', {
        thing1: couponName,
        date2: expireDate,
        thing3: '即将过期，请尽快使用',
      });
    }
  }

  // ==================== Access Token 管理 ====================

  /** Redis 缓存 key 前缀 */
  private readonly TOKEN_CACHE_KEY = 'wechat:access_token';

  /**
   * 获取/缓存微信 access_token
   * 优先从 Redis 读取，过期后调用微信 API 刷新，缓存 TTL 7000 秒
   */
  async getAccessToken(appId: string, appSecret: string): Promise<string> {
    const cacheKey = `${this.TOKEN_CACHE_KEY}:${appId}`;

    // 优先从缓存读取
    const cached = await this.redis.get<string>(cacheKey);
    if (cached) {
      return cached;
    }

    // 缓存未命中，调用微信 API
    try {
      const response = await firstValueFrom(
        this.http.get<AccessTokenResponse>(
          `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`,
        ),
      );

      const data = response.data;

      if (!data.access_token) {
        throw new Error(`获取 access_token 失败: ${JSON.stringify(data)}`);
      }

      const token = data.access_token;
      const ttl = Math.min(data.expires_in || 7200, 7200) - 200; // 提前 200s 过期，确保安全

      // 写入 Redis，TTL 7000 秒
      await this.redis.set(cacheKey, token, ttl);

      this.logger.log(`[Notify] access_token 已缓存，TTL: ${ttl}s`);

      return token;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`获取微信 access_token 失败: ${message}`);
    }
  }
}
