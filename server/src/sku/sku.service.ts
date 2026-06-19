import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { CreateSpecTemplateDto } from './dto/create-spec-template.dto';
import { UpdateSpecTemplateDto } from './dto/update-spec-template.dto';

@Injectable()
export class SkuService {
  constructor(private prisma: PrismaService) {}

  // ==================== SKU ====================

  async create(dishId: string, dto: CreateSkuDto) {
    return this.prisma.sku.create({
      data: {
        dishId,
        specs: (dto.specs ?? []) as unknown as Prisma.InputJsonValue,
        price: dto.price,
        stock: dto.stock ?? 0,
        availableStock: dto.availableStock ?? 0,
      },
    });
  }

  async findByDish(dishId: string) {
    return this.prisma.sku.findMany({
      where: { dishId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string) {
    const sku = await this.prisma.sku.findUnique({ where: { id } });
    if (!sku) {
      throw new NotFoundException('SKU 不存在');
    }
    return sku;
  }

  async update(id: string, dto: UpdateSkuDto) {
    await this.findById(id);
    return this.prisma.sku.update({
      where: { id },
      data: {
        price: dto.price,
        stock: dto.stock,
        availableStock: dto.availableStock,
        status: dto.status,
        specs: dto.specs as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    return this.prisma.sku.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  async updateStock(
    id: string,
    stock: number,
    availableStock: number,
    version: number,
  ) {
    const result = await this.prisma.sku.updateMany({
      where: { id, version },
      data: {
        stock,
        availableStock,
        version: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new ConflictException('库存已被修改，请刷新重试');
    }

    return this.prisma.sku.findUnique({ where: { id } });
  }

  async batchUpdateStock(
    items: {
      id: string;
      stock: number;
      availableStock: number;
      version: number;
    }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const results: unknown[] = [];

      for (const item of items) {
        const result = await tx.sku.updateMany({
          where: { id: item.id, version: item.version },
          data: {
            stock: item.stock,
            availableStock: item.availableStock,
            version: { increment: 1 },
          },
        });

        if (result.count === 0) {
          throw new ConflictException(
            `SKU ${item.id} 库存已被修改，请刷新重试`,
          );
        }

        const updated = await tx.sku.findUnique({ where: { id: item.id } });
        results.push(updated);
      }

      return results;
    });
  }

  // ==================== SpecTemplate ====================

  async createTemplate(storeId: string, dto: CreateSpecTemplateDto) {
    return this.prisma.specTemplate.create({
      data: {
        storeId,
        name: dto.name,
        options: dto.options as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findTemplates(storeId: string) {
    return this.prisma.specTemplate.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findTemplateById(id: string) {
    const template = await this.prisma.specTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('规格模板不存在');
    }
    return template;
  }

  async updateTemplate(id: string, dto: UpdateSpecTemplateDto) {
    await this.findTemplateById(id);
    return this.prisma.specTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        options: dto.options as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async deleteTemplate(id: string) {
    await this.findTemplateById(id);
    return this.prisma.specTemplate.delete({ where: { id } });
  }
}
