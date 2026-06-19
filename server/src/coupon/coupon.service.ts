import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponTemplateDto } from './dto/create-coupon-template.dto';
import { UpdateCouponTemplateDto } from './dto/update-coupon-template.dto';

@Injectable()
export class CouponService {
  constructor(private prisma: PrismaService) {}

  // ==================== 模板 CRUD（商家端） ====================

  async createTemplate(storeId: string, dto: CreateCouponTemplateDto) {
    return this.prisma.couponTemplate.create({
      data: {
        storeId,
        name: dto.name,
        type: dto.type,
        threshold: dto.threshold,
        value: dto.value,
        maxValue: dto.maxValue,
        totalQty: dto.totalQty,
        validDays: dto.validDays,
        startAt: dto.startAt,
        endAt: dto.endAt,
      },
    });
  }

  async findTemplates(storeId: string) {
    return this.prisma.couponTemplate.findMany({
      where: { storeId, status: { not: 'deleted' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findTemplateById(id: string) {
    const template = await this.prisma.couponTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('优惠券模板不存在');
    return template;
  }

  async updateTemplate(id: string, dto: UpdateCouponTemplateDto) {
    await this.findTemplateById(id);
    return this.prisma.couponTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async removeTemplate(id: string) {
    await this.findTemplateById(id);
    return this.prisma.couponTemplate.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  // ==================== C 端领券/查询 ====================

  /** 获取可领取的优惠券模板列表（按门店筛选） */
  async getClaimableTemplates(storeId: string, userId: string) {
    const now = new Date();
    const templates = await this.prisma.couponTemplate.findMany({
      where: { storeId, status: 'active' },
    });

    const userCoupons = await this.prisma.userCoupon.findMany({
      where: { userId, status: { not: 'expired' } },
    });
    const claimedIds = new Set(userCoupons.map((uc) => uc.templateId));

    return templates.filter((t) => {
      if (claimedIds.has(t.id)) return false;               // 已领取
      if (t.usedQty >= t.totalQty) return false;             // 库存耗尽
      if (t.startAt && new Date(t.startAt) > now) return false; // 未开始
      if (t.endAt && new Date(t.endAt) < now) return false;     // 已过期
      return true;
    });
  }

  /**
   * 用户领取优惠券
   * - 每人每模板限领一张（数据库唯一约束兜底）
   * - 库存扣减使用原子操作防超领
   */
  async claim(userId: string, templateId: string) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.couponTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new NotFoundException('优惠券模板不存在');
      }

      if (template.status !== 'active') {
        throw new BadRequestException('优惠券已下架');
      }

      if (template.usedQty >= template.totalQty) {
        throw new BadRequestException('优惠券已被领完');
      }

      // 先原子扣库存，防止超领
      const updated = await tx.couponTemplate.updateMany({
        where: {
          id: templateId,
          usedQty: { lt: template.totalQty },
        },
        data: { usedQty: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new BadRequestException('优惠券已被领完');
      }

      // 唯一约束保证不重复领取
      try {
        const userCoupon = await tx.userCoupon.create({
          data: { userId, templateId },
          include: { template: true },
        });
        return userCoupon;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new BadRequestException('您已领取过该优惠券');
        }
        throw error;
      }
    });
  }

  /**
   * 获取用户拥有的优惠券
   */
  async getUserCoupons(userId: string, status?: string) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    return this.prisma.userCoupon.findMany({
      where,
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 获取可用于当前订单的优惠券
   * 含折扣金额预计算，供前端展示
   */
  async getAvailableForOrder(userId: string, orderAmount: number) {
    const now = new Date();

    const coupons = await this.prisma.userCoupon.findMany({
      where: {
        userId,
        status: 'available',
        template: {
          status: 'active',
        },
      },
      include: { template: true },
    });

    const available = coupons.filter((uc) => {
      const t = uc.template;

      // 模板日期范围
      if (t.startAt && new Date(t.startAt) > now) return false;
      if (t.endAt && new Date(t.endAt) < now) return false;

      // 有效天数（从领取日起算）
      if (t.validDays) {
        const expireDate = new Date(uc.createdAt);
        expireDate.setDate(expireDate.getDate() + t.validDays);
        if (expireDate < now) return false;
      }

      // 门槛校验
      if (t.threshold != null && orderAmount < t.threshold) return false;

      return true;
    });

    // 预计算每张券的优惠金额
    return available.map((uc) => ({
      ...uc,
      discountAmount: this._calcDiscount(uc.template, orderAmount),
    }));
  }

  /**
   * 核销优惠券
   */
  async useCoupon(userCouponId: string, _orderId: string) {
    const coupon = await this.prisma.userCoupon.findUnique({
      where: { id: userCouponId },
    });

    if (!coupon) {
      throw new NotFoundException('优惠券不存在');
    }

    if (coupon.status !== 'available') {
      throw new BadRequestException('优惠券不可用');
    }

    return this.prisma.userCoupon.update({
      where: { id: userCouponId },
      data: {
        status: 'used',
        usedAt: new Date(),
      },
    });
  }

  /**
   * 标记过期优惠券（定时任务调用）
   */
  async expireCheck() {
    const now = new Date();

    const coupons = await this.prisma.userCoupon.findMany({
      where: { status: 'available' },
      include: { template: true },
    });

    const expiredIds: string[] = [];

    for (const uc of coupons) {
      const t = uc.template;

      // 模板结束时间过期
      if (t.endAt && new Date(t.endAt) < now) {
        expiredIds.push(uc.id);
        continue;
      }

      // 有效天数过期
      if (t.validDays) {
        const expireDate = new Date(uc.createdAt);
        expireDate.setDate(expireDate.getDate() + t.validDays);
        if (expireDate < now) {
          expiredIds.push(uc.id);
        }
      }
    }

    if (expiredIds.length > 0) {
      await this.prisma.userCoupon.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'expired' },
      });
    }

    return { expired: expiredIds.length };
  }

  // ==================== private ====================

  private _calcDiscount(template: any, orderAmount: number): number {
    switch (template.type) {
      case 'full_reduction': {
        // 满减券：直接减免 value 金额，不超过 maxValue
        let reduction = template.value;
        if (template.maxValue && reduction > template.maxValue) {
          reduction = template.maxValue;
        }
        return reduction;
      }

      case 'discount': {
        // 折扣券：value=80 即打 8 折，折扣金额 = orderAmount * (100-value) / 100，不超过 maxValue
        const discount = Math.floor(
          (orderAmount * (100 - template.value)) / 100,
        );
        if (template.maxValue && discount > template.maxValue) {
          return template.maxValue;
        }
        return discount;
      }

      case 'product':
        // 商品兑换券：直接抵扣商品价值
        return template.value;

      default:
        return 0;
    }
  }
}
