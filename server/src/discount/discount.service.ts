import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountRuleDto } from './dto/create-discount-rule.dto';
import { UpdateDiscountRuleDto } from './dto/update-discount-rule.dto';

interface OrderItem {
  dishId?: string;
  categoryId?: string;
  price: number;
  quantity: number;
}

interface DiscountResult {
  discountAmount: number;
  appliedRules: string[];
  finalAmount: number;
}

@Injectable()
export class DiscountService {
  constructor(private prisma: PrismaService) {}

  // ==================== CRUD ====================

  async create(storeId: string, dto: CreateDiscountRuleDto) {
    return this.prisma.discountRule.create({
      data: {
        storeId,
        name: dto.name,
        conditions: dto.conditions,
        actions: dto.actions,
        priority: dto.priority ?? 0,
        isStackable: dto.isStackable ?? false,
        startAt: dto.startAt,
        endAt: dto.endAt,
      },
    });
  }

  async findAll(storeId: string) {
    return this.prisma.discountRule.findMany({
      where: { storeId, status: { not: 'deleted' } },
      orderBy: { priority: 'asc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.discountRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('折扣规则不存在');
    return rule;
  }

  async update(id: string, dto: UpdateDiscountRuleDto) {
    await this.findOne(id);
    return this.prisma.discountRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.discountRule.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  // ==================== 核心折扣计算引擎 ====================

  async calculateDiscount(
    storeId: string,
    items: OrderItem[],
  ): Promise<DiscountResult> {
    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const allRules = await this.prisma.discountRule.findMany({
      where: { storeId, status: 'active' },
      orderBy: { priority: 'asc' },
    });

    const now = new Date();

    // Filter rules within date range and check condition matching
    const matchingRules = allRules.filter((rule) => {
      // 日期范围校验
      if (rule.startAt && new Date(rule.startAt) > now) return false;
      if (rule.endAt && new Date(rule.endAt) < now) return false;
      // 条件匹配
      return this._matchConditions(
        rule.conditions as Record<string, any>,
        items,
        totalAmount,
      );
    });

    if (matchingRules.length === 0) {
      return { discountAmount: 0, appliedRules: [], finalAmount: totalAmount };
    }

    // 分离可叠加与不可叠加规则
    const stackableRules = matchingRules.filter((r) => r.isStackable);
    const nonStackableRules = matchingRules.filter((r) => !r.isStackable);

    let appliedRules: typeof matchingRules = [];

    if (nonStackableRules.length > 0) {
      // 不可叠加规则：只取优先级最高的一条
      appliedRules.push(nonStackableRules[0]);
      // 可叠加规则叠加在之上
      appliedRules = appliedRules.concat(stackableRules);
    } else {
      // 全是可叠加规则，全部应用
      appliedRules = stackableRules;
    }

    // 计算总折扣金额
    let discountAmount = 0;
    for (const rule of appliedRules) {
      const actions = rule.actions as Record<string, any>;
      discountAmount += this._computeDiscount(actions, items, totalAmount);
    }

    const finalAmount = Math.max(0, totalAmount - discountAmount);

    return {
      discountAmount,
      appliedRules: appliedRules.map((r) => r.name),
      finalAmount,
    };
  }

  // ==================== private ====================

  private _matchConditions(
    conditions: Record<string, any>,
    items: OrderItem[],
    totalAmount: number,
  ): boolean {
    const type = conditions.type;

    switch (type) {
      case 'min_amount':
        return totalAmount >= conditions.value;

      case 'min_quantity': {
        const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
        return totalQty >= conditions.value;
      }

      case 'first_order':
        // first_order 条件通过外部传入上下文判断，此处仅通过类型命中
        // 实际使用时由调用方在调用前过滤非首单用户
        return true;

      case 'specific_dishes': {
        const dishIds: string[] = conditions.value || [];
        return items.some(
          (item) => item.dishId && dishIds.includes(item.dishId),
        );
      }

      case 'specific_category': {
        const categoryIds: string[] = conditions.value || [];
        return items.some(
          (item) => item.categoryId && categoryIds.includes(item.categoryId),
        );
      }

      default:
        return false;
    }
  }

  private _computeDiscount(
    actions: Record<string, any>,
    items: OrderItem[],
    totalAmount: number,
  ): number {
    const type = actions.type;
    const value = Number(actions.value) || 0;

    switch (type) {
      case 'percent_off':
        // value 为折扣百分比，如 20 表示打 8 折（优惠 20%）
        return Math.floor(totalAmount * value / 100);

      case 'amount_off':
        // value 为固定减免金额（分），不能超过订单总额
        return Math.min(value, totalAmount);

      case 'fixed_price':
        // value 为统一特价（分），对符合条件的商品计算差价
        // 此处简化：对所有商品应用特价
        return items.reduce((sum, item) => {
          const origPrice = item.price * item.quantity;
          const fixedPrice = value * item.quantity;
          if (fixedPrice < origPrice) {
            return sum + (origPrice - fixedPrice);
          }
          return sum;
        }, 0);

      case 'free_item':
        // 免一件最低价商品
        if (items.length === 0) return 0;
        const minPrice = Math.min(...items.map((i) => i.price));
        return minPrice;

      default:
        return 0;
    }
  }
}
