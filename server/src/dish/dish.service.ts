import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
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

  // ==================== CSV 导入导出 ====================

  private readonly logger = new Logger(DishService.name);

  /** CSV 头部字段 */
  private readonly CSV_HEADERS = ['name', 'categoryId', 'unit', 'price(分)', 'status'];

  /**
   * 批量导入菜品 (CSV 文本)
   * @returns { created, errors[] }
   */
  async importCsv(
    storeId: string,
    csvContent: string,
  ): Promise<{ created: any[]; errors: { row: number; error: string }[] }> {
    const rows = this.parseCsv(csvContent);

    if (rows.length === 0) {
      throw new BadRequestException('CSV 文件为空或格式不正确');
    }

    // Pre-resolve all categories referenced in the CSV to avoid N+1 queries
    const referencedCategoryIds = [
      ...new Set(
        rows.map((r) => r.categoryId?.trim()).filter(Boolean),
      ),
    ] as string[];
    const existingCategories = await this.prisma.category.findMany({
      where: { id: { in: referencedCategoryIds }, storeId },
    });
    const categoryMap = new Map(existingCategories.map((c) => [c.id, c]));

    // Resolve default category once
    let defaultCategory =
      await this.prisma.category.findFirst({ where: { storeId } });
    if (!defaultCategory) {
      defaultCategory = await this.prisma.category.create({
        data: { storeId, name: '默认分类' },
      });
    }

    const created: any[] = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Normalize header: accept both 'price' and 'price(分)'
      if (row['price(分)'] !== undefined && row['price'] === undefined) {
        row['price'] = row['price(分)'];
      }
      try {
        // Validate required fields
        if (!row.name || !row.name.trim()) {
          errors.push({ row: i + 1, error: '菜品名称不能为空' });
          continue;
        }

        const priceRaw = (row.price || '').trim();
        if (!priceRaw) {
          errors.push({ row: i + 1, error: '价格不能为空（须为正整数，单位：分）' });
          continue;
        }
        const priceNum = Number(priceRaw);
        if (isNaN(priceNum) || priceNum <= 0 || !Number.isInteger(priceNum)) {
          errors.push({
            row: i + 1,
            error: `价格无效: ${row.price}（须为正整数，单位：分）`,
          });
          continue;
        }
        const price = Math.round(priceNum);

        // Resolve category from pre-fetched map or use default
        const categoryIdInput = row.categoryId?.trim();
        let categoryId: string;
        if (categoryIdInput && categoryMap.has(categoryIdInput)) {
          categoryId = categoryIdInput;
        } else if (categoryIdInput && !categoryMap.has(categoryIdInput)) {
          errors.push({
            row: i + 1,
            error: `分类 ${categoryIdInput} 不存在`,
          });
          continue;
        } else {
          categoryId = defaultCategory.id;
        }

        // Create dish + SKU atomically
        const dish = await this.prisma.$transaction(async (tx) => {
          const d = await tx.dish.create({
            data: {
              storeId,
              name: row.name.trim(),
              categoryId,
              unit: row.unit || '份',
              status: row.status === 'published' ? 'published' : 'draft',
              imageUrl: row.imageUrl || undefined,
            },
            include: {
              skus: true,
              images: true,
              category: { select: { id: true, name: true } },
            },
          });

          await tx.sku.create({
            data: {
              dishId: d.id,
              specs: {},
              price,
              availableStock: 999,
            },
          });

          return d;
        });

        created.push(dish);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    this.logger.log(
      `[CSV Import] store=${storeId} created=${created.length} errors=${errors.length}`,
    );

    return { created, errors };
  }

  /**
   * 导出菜品为 CSV 文本
   */
  async exportCsv(storeId: string): Promise<string> {
    const dishes = await this.prisma.dish.findMany({
      where: { storeId },
      include: {
        skus: { take: 1 },
        category: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = this.CSV_HEADERS.join(',');
    const rows = dishes.map((d) => {
      const firstSku = d.skus[0];
      return [
        this.csvEscape(d.name),
        d.categoryId || '',
        d.unit || '份',
        firstSku?.price ?? '',
        d.status,
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  /** 简易 CSV 解析 (支持引号包裹) */
  private parseCsv(content: string): Record<string, string>[] {
    const lines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    const headers = this.parseCsvLine(lines[0]);
    const result: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || '';
      }
      result.push(row);
    }

    return result;
  }

  /** 解析一行 CSV，支持双引号包裹 */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  /** CSV 字段转义 */
  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
