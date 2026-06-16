import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class CategoryService {
  constructor(private prisma: PrismaService) {}

  async create(storeId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        storeId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAll(storeId: string, pagination?: PaginationDto) {
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where: { storeId },
        orderBy: { sortOrder: 'asc' },
        skip,
        take: pageSize,
        include: {
          _count: { select: { dishes: true } },
        },
      }),
      this.prisma.category.count({ where: { storeId } }),
    ]);

    return {
      items,
      total,
      hasMore: skip + items.length < total,
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { dishes: true } },
      },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    const dishCount = await this.prisma.dish.count({
      where: { categoryId: id },
    });

    if (dishCount > 0) {
      throw new ConflictException('该分类下存在菜品，无法删除');
    }

    return this.prisma.category.delete({ where: { id } });
  }

  async batchSort(items: { id: string; sortOrder: number }[]) {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    return { success: true };
  }
}
