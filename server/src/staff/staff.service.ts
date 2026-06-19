import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateStaffDto) {
    const existing = await this.prisma.adminUser.findUnique({
      where: {
        tenantId_username: {
          tenantId,
          username: dto.username,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Username already exists in this tenant');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.adminUser.create({
      data: {
        tenantId,
        username: dto.username,
        passwordHash,
        role: dto.role,
        storeId: dto.storeId ?? null,
      },
      select: {
        id: true,
        tenantId: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        lockedUntil: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.adminUser.findMany({
      where: { tenantId },
      select: {
        id: true,
        tenantId: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        lockedUntil: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        lockedUntil: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Staff not found');
    }

    return user;
  }

  async update(tenantId: string, id: string, dto: UpdateStaffDto) {
    await this.findOne(tenantId, id);

    return this.prisma.adminUser.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        tenantId: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        lockedUntil: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.adminUser.update({
      where: { id },
      data: { status: 'inactive' },
      select: {
        id: true,
        tenantId: true,
        username: true,
        role: true,
        storeId: true,
        status: true,
        lockedUntil: true,
        loginAttempts: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async resetPassword(tenantId: string, id: string, newPassword: string) {
    await this.findOne(tenantId, id);

    const passwordHash = await bcrypt.hash(newPassword, 10);

    return this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash },
      select: {
        id: true,
        username: true,
        updatedAt: true,
      },
    });
  }

  async lockAccount(tenantId: string, id: string, minutes: number) {
    await this.findOne(tenantId, id);

    const lockedUntil = new Date(Date.now() + minutes * 60 * 1000);

    return this.prisma.adminUser.update({
      where: { id },
      data: { lockedUntil },
      select: {
        id: true,
        username: true,
        lockedUntil: true,
        updatedAt: true,
      },
    });
  }

  async unlockAccount(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    return this.prisma.adminUser.update({
      where: { id },
      data: {
        lockedUntil: null,
        loginAttempts: 0,
      },
      select: {
        id: true,
        username: true,
        lockedUntil: true,
        loginAttempts: true,
        updatedAt: true,
      },
    });
  }
}
