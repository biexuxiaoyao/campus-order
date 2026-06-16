import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoreService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        tenantId,
        ...dto,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
    });
  }

  async findOne(tenantId: string, id: string) {
    return this.prisma.store.findFirst({
      where: { id, tenantId },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateStoreDto) {
    return this.prisma.store.updateMany({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string) {
    return this.prisma.store.updateMany({
      where: { id, tenantId },
      data: { status: 'deleted' },
    });
  }
}
