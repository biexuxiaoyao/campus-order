import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { QueryDishDto } from './dto/query-dish.dto';
import { PaginatedResponse } from '../common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

const dishInclude = {
  skus: true,
  images: { orderBy: { sortOrder: 'asc' as const } },
  related: {
    include: {
      related: {
        include: {
          skus: { take: 1 },
          images: { take: 1, orderBy: { sortOrder: 'asc' as const } },
        },
      },
    },
  },
  category: { select: { id: true, name: true } },
} satisfies Prisma.DishInclude;

@Injectable()
export class DishService {
  constructor(private prisma: PrismaService) {}

  async create(storeId: string, dto: CreateDishDto) {
    const dish = await this.prisma.dish.create({
      data: {
        storeId,
        categoryId: dto.categoryId,
        name: dto.name,
        imageUrl: dto.imageUrl ?? null,
        unit: dto.unit ?? '份',
        scheduledPublishAt: dto.scheduledPublishAt
          ? new Date(dto.scheduledPublishAt)
          : null,
        scheduledUnpublishAt: dto.scheduledUnpublishAt
          ? new Date(dto.scheduledUnpublishAt)
          : null,
        status: 'draft',
      },
      include: dishInclude,
    });

    // Auto-create default SKU so dish is immediately usable
    const skuId = `${dish.id}-标准`;
    await this.prisma.sku.create({
      data: {
        id: skuId,
        dishId: dish.id,
        specs: [{ name: '规格', value: '标准' }],
        price: dto.price ?? 0,
        stock: dto.stock ?? 0,
        availableStock: dto.stock ?? 0,
      },
    });

    // Re-fetch with SKU included
    return this.prisma.dish.findUnique({
      where: { id: dish.id },
      include: dishInclude,
    });
  }

  async findAll(
    storeId: string,
    query: QueryDishDto,
  ): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.DishWhereInput = { storeId };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.keyword) {
      where.name = { contains: query.keyword };
    }

    if (query.status) {
      where.status = query.status;
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({
        where,
        include: {
          skus: true,
          images: { orderBy: { sortOrder: 'asc' } },
          category: { select: { id: true, name: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dish.count({ where }),
    ]);

    return {
      items,
      total,
      hasMore: skip + pageSize < total,
    };
  }

  async findOne(id: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      include: dishInclude,
    });

    if (!dish) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    return dish;
  }

  async update(id: string, dto: UpdateDishDto) {
    const existing = await this.prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    const data: Prisma.DishUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.categoryId !== undefined)
      data.category = { connect: { id: dto.categoryId } };
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.scheduledPublishAt !== undefined) {
      data.scheduledPublishAt = dto.scheduledPublishAt
        ? new Date(dto.scheduledPublishAt)
        : null;
    }
    if (dto.scheduledUnpublishAt !== undefined) {
      data.scheduledUnpublishAt = dto.scheduledUnpublishAt
        ? new Date(dto.scheduledUnpublishAt)
        : null;
    }

    return this.prisma.dish.update({
      where: { id },
      data,
      include: dishInclude,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    return this.prisma.dish.update({
      where: { id },
      data: { status: 'offline' },
    });
  }

  async publish(id: string) {
    const existing = await this.prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    return this.prisma.dish.update({
      where: { id },
      data: { status: 'published' },
    });
  }

  async unpublish(id: string) {
    const existing = await this.prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    return this.prisma.dish.update({
      where: { id },
      data: { status: 'draft' },
    });
  }

  async batchUpdateStatus(ids: string[], status: string) {
    return this.prisma.dish.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  async setEstimated(id: string, estimated: boolean) {
    const existing = await this.prisma.dish.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`菜品 ${id} 不存在`);
    }

    return this.prisma.dish.update({
      where: { id },
      data: { estimatedToday: estimated },
    });
  }

  async addImage(dishId: string, url: string, sortOrder?: number) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });
    if (!dish) {
      throw new NotFoundException(`菜品 ${dishId} 不存在`);
    }

    return this.prisma.dishImage.create({
      data: {
        dishId,
        url,
        sortOrder: sortOrder ?? 0,
      },
    });
  }

  async removeImage(imageId: string) {
    const image = await this.prisma.dishImage.findUnique({
      where: { id: imageId },
    });
    if (!image) {
      throw new NotFoundException(`图片 ${imageId} 不存在`);
    }

    return this.prisma.dishImage.delete({ where: { id: imageId } });
  }

  async addRelated(dishId: string, relatedId: string) {
    if (dishId === relatedId) {
      throw new ConflictException('不能关联自身');
    }

    const [dish, related] = await this.prisma.$transaction([
      this.prisma.dish.findUnique({ where: { id: dishId } }),
      this.prisma.dish.findUnique({ where: { id: relatedId } }),
    ]);

    if (!dish) throw new NotFoundException(`菜品 ${dishId} 不存在`);
    if (!related) throw new NotFoundException(`关联菜品 ${relatedId} 不存在`);

    return this.prisma.relatedDish.create({
      data: { dishId, relatedId },
      include: {
        related: {
          include: {
            skus: { take: 1 },
            images: { take: 1, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
  }

  async removeRelated(relatedId: string) {
    const record = await this.prisma.relatedDish.findUnique({
      where: { id: relatedId },
    });
    if (!record) {
      throw new NotFoundException(`关联关系 ${relatedId} 不存在`);
    }

    return this.prisma.relatedDish.delete({ where: { id: relatedId } });
  }

  /** C端: 查询已上架的菜品列表 (租户隔离) */
  async findPublished(
    tenantId: string,
    storeId: string,
    query: QueryDishDto,
  ): Promise<PaginatedResponse<unknown>> {
    const where: Prisma.DishWhereInput = {
      store: { tenantId },
      storeId,
      status: 'published',
    };

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.keyword) {
      where.name = { contains: query.keyword };
    }

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({
        where,
        include: {
          skus: true,
          images: { orderBy: { sortOrder: 'asc' } },
          category: { select: { id: true, name: true } },
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.dish.count({ where }),
    ]);

    return {
      items,
      total,
      hasMore: skip + pageSize < total,
    };
  }

  async getCategories(tenantId?: string) {
    const where: any = {};
    if (tenantId) {
      where.store = { tenantId };
    }
    return this.prisma.category.findMany({
      where,
      select: { id: true, name: true, storeId: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
