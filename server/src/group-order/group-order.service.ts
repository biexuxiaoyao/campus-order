import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { CreateGroupOrderDto } from './dto/create-group-order.dto';
import { JoinGroupOrderDto } from './dto/join-group-order.dto';
import { RepresentOrderDto } from './dto/represent-order.dto';

/** Generate group number: G + YYYYMMDD + 8 random digits */
function generateGroupNo(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 1e8)
    .toString()
    .padStart(8, '0');
  return `G${y}${m}${d}${rand}`;
}

/** Generate order number: YYYYMMDD + 10 random digits */
function generateOrderNo(): string {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 1e10)
    .toString()
    .padStart(10, '0');
  return `${y}${m}${d}${rand}`;
}

/** Format SKU specs JSON into a readable string */
function formatSpecName(specs: any): string {
  if (!specs) return '';
  if (typeof specs === 'string') return specs;
  if (Array.isArray(specs)) {
    return specs.map((s: any) => s.value).join('/');
  }
  const entries = Object.entries(specs as Record<string, any>);
  return entries.map(([, v]) => v).join('/');
}

@Injectable()
export class GroupOrderService {
  private readonly logger = new Logger(GroupOrderService.name);

  constructor(
    private prisma: PrismaService,
    private notify: NotifyService,
  ) {}

  /** Create a pooling group order */
  async createPool(
    leaderId: string,
    tenantId: string,
    dto: CreateGroupOrderDto,
  ) {
    const { storeId, deadline, condition, minAmount } = dto;

    // Validate store belongs to tenant
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
    });
    if (!store) {
      throw new NotFoundException('门店不存在');
    }

    const groupNo = generateGroupNo();

    const groupOrder = await this.prisma.groupOrder.create({
      data: {
        groupNo,
        tenantId,
        storeId,
        leaderId,
        mode: 'pool',
        status: 'pooling',
        deadline: deadline
          ? new Date(deadline)
          : new Date(Date.now() + 2 * 60 * 60 * 1000), // default 2h
        condition: condition || 'A',
        minAmount: minAmount || undefined,
      },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: true,
      },
    });

    return groupOrder;
  }

  /** List active pools for a store */
  async getPool(tenantId: string, storeId: string) {
    const now = new Date();

    const pools = await this.prisma.groupOrder.findMany({
      where: {
        tenantId,
        storeId,
        status: 'pooling',
        deadline: { gt: now },
      },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return pools.map((pool) => ({
      ...pool,
      itemCount: pool.items.length,
      items: undefined,
    }));
  }

  /** Get group order detail with all items, participants, leader */
  async getDetail(groupOrderId: string) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });

    if (!groupOrder) {
      throw new NotFoundException('团单不存在');
    }

    return groupOrder;
  }

  /** Join a pooling group order with items */
  async joinPool(groupOrderId: string, userId: string, dto: JoinGroupOrderDto) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
    });

    if (!groupOrder) {
      throw new NotFoundException('团单不存在');
    }

    if (groupOrder.status !== 'pooling') {
      throw new BadRequestException('该团单已结束，无法参与');
    }

    if (groupOrder.deadline && new Date() > groupOrder.deadline) {
      throw new BadRequestException('该团单已超过截止时间');
    }

    // Validate SKUs exist
    const skuIds = dto.items.map((item) => item.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, status: 'active' },
      include: { dish: true },
    });
    const skuMap = new Map(skus.map((s) => [s.id, s]));

    // Upsert each item
    const results: any[] = [];
    for (const itemDto of dto.items) {
      const sku = skuMap.get(itemDto.skuId);
      if (!sku) {
        throw new NotFoundException(`SKU ${itemDto.skuId} 不存在或已下架`);
      }

      // Use upsert: if same user+SKU already exists in this group, increment quantity
      const previous = await this.prisma.groupOrderItem.findUnique({
        where: {
          groupOrderId_userId_skuId: {
            groupOrderId,
            userId,
            skuId: itemDto.skuId,
          },
        },
      });

      const newQuantity = previous
        ? previous.quantity + itemDto.quantity
        : itemDto.quantity;

      // Check stock availability (readonly — actual deduction at closePool time)
      if (sku.availableStock < newQuantity) {
        throw new BadRequestException(
          `${sku.dish.name} 库存不足（需要 ${newQuantity}，可用 ${sku.availableStock}）`,
        );
      }

      const result = await this.prisma.groupOrderItem.upsert({
        where: {
          groupOrderId_userId_skuId: {
            groupOrderId,
            userId,
            skuId: itemDto.skuId,
          },
        },
        create: {
          groupOrderId,
          userId,
          skuId: itemDto.skuId,
          dishName: itemDto.dishName || sku.dish.name,
          specName: itemDto.specName || '',
          price: itemDto.price ?? sku.price,
          quantity: itemDto.quantity,
        },
        update: {
          quantity: newQuantity,
          dishName: itemDto.dishName || sku.dish.name,
          specName: itemDto.specName || '',
          price: itemDto.price ?? sku.price,
        },
      });

      results.push(result);
    }

    return results;
  }

  /** Leader closes the pool — check condition and finalize status */
  async closePool(groupOrderId: string, leaderId: string) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: { items: true },
    });

    if (!groupOrder) {
      throw new NotFoundException('团单不存在');
    }

    if (groupOrder.leaderId !== leaderId) {
      throw new ForbiddenException('只有团长才能关闭团单');
    }

    if (groupOrder.status !== 'pooling') {
      throw new BadRequestException('该团单已关闭');
    }

    let newStatus: string;

    if (groupOrder.condition === 'A' && groupOrder.minAmount != null) {
      // Condition A: sum of all item prices * quantity >= minAmount
      const totalAmount = groupOrder.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );

      if (totalAmount >= groupOrder.minAmount) {
        newStatus = 'success';
      } else {
        newStatus = 'cancelled';
      }
    } else {
      // No condition check needed (condition B not yet implemented, or no minAmount set)
      newStatus = 'success';
    }

    // === Success path: deduct stock + create Orders + back-link ===
    if (newStatus === 'success') {
      // Fetch full SKU data for stock deduction (with version for optimistic lock)
      const allSkuIds = [...new Set(groupOrder.items.map((i) => i.skuId))];
      const skus = await this.prisma.sku.findMany({
        where: { id: { in: allSkuIds } },
      });
      const skuMap = new Map(skus.map((s) => [s.id, s]));

      // Group items by userId — one Order per participant
      const itemsByUser = new Map<string, typeof groupOrder.items>();
      for (const item of groupOrder.items) {
        if (!itemsByUser.has(item.userId)) {
          itemsByUser.set(item.userId, []);
        }
        itemsByUser.get(item.userId)!.push(item);
      }

      // All-or-nothing transaction
      await this.prisma.$transaction(async (tx) => {
        // Step 1: Deduct stock for all SKUs (aggregated across users)
        const stockDeductionMap = new Map<string, number>();
        for (const item of groupOrder.items) {
          const current = stockDeductionMap.get(item.skuId) || 0;
          stockDeductionMap.set(item.skuId, current + item.quantity);
        }

        for (const [skuId, totalQty] of stockDeductionMap) {
          const sku = skuMap.get(skuId)!;
          const result = await tx.sku.updateMany({
            where: {
              id: skuId,
              version: sku.version,
              availableStock: { gte: totalQty },
            },
            data: {
              availableStock: { decrement: totalQty },
              version: { increment: 1 },
            },
          });
          if (result.count === 0) {
            throw new ConflictException(
              `SKU ${skuId} 库存扣减失败，可能已被其他订单占用，请重新开团`,
            );
          }
        }

        // Step 2: Create one Order per userId
        for (const [userId, userItems] of itemsByUser) {
          const orderNo = generateOrderNo();
          const orderTotal = userItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );

          const order = await tx.order.create({
            data: {
              orderNo,
              tenantId: groupOrder.tenantId,
              userId,
              storeId: groupOrder.storeId,
              type: 'group_pool',
              status: 'pending',
              totalAmount: orderTotal,
              items: {
                create: userItems.map((item) => ({
                  skuId: item.skuId,
                  dishName: item.dishName,
                  specName: item.specName,
                  price: item.price,
                  quantity: item.quantity,
                })),
              },
              timeline: {
                create: { status: 'pending' },
              },
            },
          });

          // Step 3: Back-link GroupOrderItem → Order
          for (const item of userItems) {
            await tx.groupOrderItem.update({
              where: { id: item.id },
              data: { orderId: order.id },
            });
          }
        }

        // Step 4: Update GroupOrder status
        await tx.groupOrder.update({
          where: { id: groupOrderId },
          data: { status: 'success' },
        });
      });
    } else {
      // Cancelled path: just update status (no stock was deducted)
      await this.prisma.groupOrder.update({
        where: { id: groupOrderId },
        data: { status: 'cancelled' },
      });
    }

    // Fetch final state with includes
    const updated = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });

    // Fire-and-forget: notify leader and all participants
    const success = newStatus === 'success';
    const participantIds = new Set([
      updated!.leaderId,
      ...updated!.items.map((i) => i.userId),
    ]);

    for (const userId of participantIds) {
      this.notify
        .notifyGroupResult(
          userId,
          updated!.tenantId,
          {
            groupNo: updated!.groupNo,
            storeName: '校园订餐',
          },
          success,
        )
        .catch((err) =>
          this.logger.error(
            `[Notify] 团单结果通知发送失败 (userId=${userId}): ${(err as Error).message}`,
          ),
        );
    }

    return updated!;
  }

  /** Create a represent order (leader orders on behalf of others, no pooling needed) */
  async representOrder(
    leaderId: string,
    tenantId: string,
    dto: RepresentOrderDto,
  ) {
    const { storeId, items } = dto;

    // Validate store belongs to tenant
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, tenantId },
    });
    if (!store) {
      throw new NotFoundException('门店不存在');
    }

    // Validate SKUs and fetch with version for optimistic lock
    const skuIds = items.map((item) => item.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, status: 'active' },
      include: { dish: true },
    });
    const skuMap = new Map(skus.map((s) => [s.id, s]));

    // Pre-validate all SKUs exist
    for (const item of items) {
      const sku = skuMap.get(item.skuId);
      if (!sku) {
        throw new NotFoundException(`SKU ${item.skuId} 不存在或已下架`);
      }
    }

    const groupNo = generateGroupNo();
    const orderNo = generateOrderNo();

    // Build items data
    const itemsData = items.map((item) => {
      const sku = skuMap.get(item.skuId)!;
      return {
        userId: leaderId,
        skuId: item.skuId,
        dishName: sku.dish.name,
        specName: formatSpecName(sku.specs),
        price: sku.price,
        quantity: item.quantity,
        recipientName: item.recipientName,
      };
    });

    const totalAmount = itemsData.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    // Execute in transaction: stock deduction + GroupOrder + Order + back-link
    const groupOrder = await this.prisma.$transaction(async (tx) => {
      // Step 1: Deduct stock with optimistic lock
      for (const item of items) {
        const sku = skuMap.get(item.skuId)!;
        const result = await tx.sku.updateMany({
          where: {
            id: item.skuId,
            version: sku.version,
            availableStock: { gte: item.quantity },
          },
          data: {
            availableStock: { decrement: item.quantity },
            version: { increment: 1 },
          },
        });
        if (result.count === 0) {
          throw new ConflictException(
            `${sku.dish.name} 库存不足或已被修改，请重试`,
          );
        }
      }

      // Step 2: Create GroupOrder
      const created = await tx.groupOrder.create({
        data: {
          groupNo,
          tenantId,
          storeId,
          leaderId,
          mode: 'represent',
          status: 'success',
          items: { create: itemsData },
        },
        include: {
          leader: { select: { id: true, nickname: true, avatar: true } },
          items: true,
        },
      });

      // Step 3: Create Order with type 'group_represent'
      const order = await tx.order.create({
        data: {
          orderNo,
          tenantId,
          userId: leaderId,
          storeId,
          type: 'group_represent',
          status: 'pending',
          totalAmount,
          items: {
            create: items.map((item) => {
              const sku = skuMap.get(item.skuId)!;
              return {
                skuId: item.skuId,
                dishName: sku.dish.name,
                specName: formatSpecName(sku.specs),
                price: sku.price,
                quantity: item.quantity,
              };
            }),
          },
          timeline: {
            create: { status: 'pending' },
          },
        },
      });

      // Step 4: Back-link GroupOrderItems to the Order
      for (const goItem of created.items) {
        await tx.groupOrderItem.update({
          where: { id: goItem.id },
          data: { orderId: order.id },
        });
      }

      return created;
    });

    return groupOrder;
  }

  /** Cancel a pooling group order (leader only, only while pooling) */
  async cancelGroup(groupOrderId: string, leaderId: string) {
    const groupOrder = await this.prisma.groupOrder.findUnique({
      where: { id: groupOrderId },
    });

    if (!groupOrder) {
      throw new NotFoundException('团单不存在');
    }

    if (groupOrder.leaderId !== leaderId) {
      throw new ForbiddenException('只有团长才能取消团单');
    }

    if (groupOrder.status !== 'pooling') {
      throw new BadRequestException('只能取消拼团中的团单');
    }

    const updated = await this.prisma.groupOrder.update({
      where: { id: groupOrderId },
      data: { status: 'cancelled' },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
    });

    return updated;
  }
}
