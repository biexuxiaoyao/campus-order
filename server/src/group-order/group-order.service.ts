import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

@Injectable()
export class GroupOrderService {
  constructor(private prisma: PrismaService) {}

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
  async joinPool(
    groupOrderId: string,
    userId: string,
    dto: JoinGroupOrderDto,
  ) {
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

    const updated = await this.prisma.groupOrder.update({
      where: { id: groupOrderId },
      data: { status: newStatus },
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

    // Validate SKUs
    const skuIds = items.map((item) => item.skuId);
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, status: 'active' },
      include: { dish: true },
    });
    const skuMap = new Map(skus.map((s) => [s.id, s]));

    const groupNo = generateGroupNo();

    // Build items data
    const itemsData = items.map((item) => {
      const sku = skuMap.get(item.skuId);
      if (!sku) {
        throw new NotFoundException(`SKU ${item.skuId} 不存在或已下架`);
      }
      return {
        userId: leaderId,
        skuId: item.skuId,
        dishName: sku.dish.name,
        specName: '',
        price: sku.price,
        quantity: item.quantity,
        recipientName: item.recipientName,
      };
    });

    const groupOrder = await this.prisma.groupOrder.create({
      data: {
        groupNo,
        tenantId,
        storeId,
        leaderId,
        mode: 'represent',
        status: 'success', // no pooling needed
        items: {
          create: itemsData,
        },
      },
      include: {
        leader: { select: { id: true, nickname: true, avatar: true } },
        items: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
          },
        },
      },
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
