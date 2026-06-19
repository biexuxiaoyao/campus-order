import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

/** 24 小时过期，单位毫秒 */
const CART_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface CartSkuDish {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface CartSkuDetail {
  id: string;
  price: number;
  stock: number;
  specs: unknown;
  dish: CartSkuDish | null;
}

export interface CartItemResponse {
  id: string;
  skuId: string;
  quantity: number;
  expiresAt: Date;
  createdAt: Date;
  subtotal: number; // price * quantity，单位: 分
  sku: CartSkuDetail | null;
}

export interface CartResponse {
  items: CartItemResponse[];
  totalAmount: number; // 单位: 分
}

export interface ValidatedCartItem {
  id: string;
  skuId: string;
  quantity: number;
  price: number;
  subtotal: number;
  specs: unknown;
  dishName: string;
  dishImage: string | null;
  stock: number;
  availableStock: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  // ==================== 查询购物车 ====================

  async getCart(userId: string, tenantId: string): Promise<CartResponse> {
    const items = await this.prisma.cartItem.findMany({
      where: { userId, tenantId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (items.length === 0) {
      return { items: [], totalAmount: 0 };
    }

    // 批量加载 SKU + 菜品信息（CartItem 模型无 sku 关联，手动 join）
    const skuIds = [...new Set(items.map((i) => i.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      include: { dish: { select: { id: true, name: true, imageUrl: true } } },
    });

    const skuMap = new Map(skus.map((s) => [s.id, s]));

    const cartItems: CartItemResponse[] = items.map((item) => {
      const sku = skuMap.get(item.skuId) ?? null;
      const price = sku?.price ?? 0;
      return {
        id: item.id,
        skuId: item.skuId,
        quantity: item.quantity,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        subtotal: price * item.quantity,
        sku: sku
          ? {
              id: sku.id,
              price: sku.price,
              stock: sku.stock,
              specs: sku.specs,
              dish: sku.dish
                ? {
                    id: sku.dish.id,
                    name: sku.dish.name,
                    imageUrl: sku.dish.imageUrl,
                  }
                : null,
            }
          : null,
      };
    });

    const totalAmount = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    return { items: cartItems, totalAmount };
  }

  // ==================== 添加商品 ====================

  async addItem(userId: string, tenantId: string, dto: AddCartItemDto) {
    const quantity = dto.quantity ?? 1;

    // 校验 SKU 是否存在且状态为 active
    const sku = await this.prisma.sku.findUnique({ where: { id: dto.skuId } });
    if (!sku) {
      throw new NotFoundException('SKU 不存在');
    }
    if (sku.status !== 'active') {
      throw new BadRequestException('该商品已下架');
    }

    // 查询同一用户+SKU 是否已有未过期的购物车项（upsert 语义）
    const existing = await this.prisma.cartItem.findFirst({
      where: {
        userId,
        tenantId,
        skuId: dto.skuId,
        expiresAt: { gt: new Date() },
      },
    });

    if (existing) {
      return this.prisma.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
          expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
        },
      });
    }

    return this.prisma.cartItem.create({
      data: {
        userId,
        tenantId,
        skuId: dto.skuId,
        quantity,
        expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
      },
    });
  }

  // ==================== 修改数量 ====================

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });
    if (!item) {
      throw new NotFoundException('购物车项不存在');
    }

    if (dto.quantity <= 0) {
      return this.prisma.cartItem.delete({ where: { id: itemId } });
    }

    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
        expiresAt: new Date(Date.now() + CART_EXPIRY_MS),
      },
    });
  }

  // ==================== 删除单项 ====================

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, userId },
    });
    if (!item) {
      throw new NotFoundException('购物车项不存在');
    }

    return this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  // ==================== 清空购物车 ====================

  async clearCart(userId: string) {
    const result = await this.prisma.cartItem.deleteMany({
      where: { userId },
    });
    return { deleted: result.count };
  }

  // ==================== 结算校验 ====================

  async validateCart(
    userId: string,
    tenantId: string,
    itemIds: string[],
  ): Promise<ValidatedCartItem[]> {
    if (!itemIds || itemIds.length === 0) {
      throw new BadRequestException('请选择至少一个商品');
    }

    const items = await this.prisma.cartItem.findMany({
      where: {
        id: { in: itemIds },
        userId,
        tenantId,
      },
    });

    if (items.length !== itemIds.length) {
      throw new NotFoundException('部分购物车项不存在');
    }

    // 检查是否过期
    const now = new Date();
    const expired = items.filter((i) => i.expiresAt <= now);
    if (expired.length > 0) {
      throw new BadRequestException('部分商品已过期，请刷新购物车');
    }

    // 批量加载 SKU
    const skuIds = [...new Set(items.map((i) => i.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds } },
      include: { dish: { select: { id: true, name: true, imageUrl: true } } },
    });
    const skuMap = new Map(skus.map((s) => [s.id, s]));

    const validated: ValidatedCartItem[] = [];

    for (const item of items) {
      const sku = skuMap.get(item.skuId);
      if (!sku) {
        throw new BadRequestException(`SKU ${item.skuId} 不存在`);
      }
      if (sku.status !== 'active') {
        throw new BadRequestException(
          `"${sku.dish?.name ?? '未知菜品'}" 已下架`,
        );
      }
      if (sku.availableStock < item.quantity) {
        throw new BadRequestException(
          `"${sku.dish?.name ?? '未知菜品'}" 库存不足（剩余 ${sku.availableStock}）`,
        );
      }

      validated.push({
        id: item.id,
        skuId: sku.id,
        quantity: item.quantity,
        price: sku.price,
        subtotal: sku.price * item.quantity,
        specs: sku.specs,
        dishName: sku.dish?.name ?? '',
        dishImage: sku.dish?.imageUrl ?? null,
        stock: sku.stock,
        availableStock: sku.availableStock,
      });
    }

    return validated;
  }

  // ==================== 清理过期项 ====================

  async cleanupExpired() {
    const result = await this.prisma.cartItem.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
      },
    });
    return { deleted: result.count };
  }
}
