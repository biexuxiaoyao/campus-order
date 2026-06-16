import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ReviewTenantDto } from './dto/review-tenant.dto';
import { AssignModulesDto } from './dto/assign-modules.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { CorrectDataDto } from './dto/correct-data.dto';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ===================== Tenant Management =====================

  /** Paginated list of tenants with filters */
  async listTenants(query: QueryTenantDto) {
    const { status, keyword, page = 1, pageSize = 20 } = query;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { appId: { contains: keyword } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: {
            select: {
              modules: true,
              stores: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        appId: t.appId,
        name: t.name,
        status: t.status,
        expireAt: t.expireAt,
        licenseKey: t.licenseKey,
        moduleCount: t._count.modules,
        storeCount: t._count.stores,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      total,
      hasMore: page * pageSize < total,
    };
  }

  /** Full tenant detail with modules, stores, brand config */
  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        modules: {
          include: {
            module: true,
          },
        },
        stores: true,
        brandConfig: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    return tenant;
  }

  /** Create tenant with appId uniqueness check. Generate licenseKey. */
  async createTenant(dto: CreateTenantDto) {
    // Check appId uniqueness
    const existing = await this.prisma.tenant.findUnique({
      where: { appId: dto.appId },
    });

    if (existing) {
      throw new ConflictException(`appId "${dto.appId}" 已被占用`);
    }

    const licenseKey = crypto.randomUUID();

    return this.prisma.tenant.create({
      data: {
        appId: dto.appId,
        name: dto.name,
        status: 'active',
        licenseKey,
      },
    });
  }

  /** Update tenant name, status, expireAt */
  async updateTenant(id: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.expireAt !== undefined) data.expireAt = new Date(dto.expireAt);

    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }

  /** Review tenant: approved -> 'active', rejected -> 'deleted'. Record in AuditLog. */
  async reviewTenant(id: string, dto: ReviewTenantDto, operatorId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    const newStatus = dto.approved ? 'active' : 'deleted';

    const [updated] = await Promise.all([
      this.prisma.tenant.update({
        where: { id },
        data: { status: newStatus },
      }),
      this.prisma.auditLog.create({
        data: {
          tenantId: id,
          operatorId,
          action: dto.approved ? 'TENANT_APPROVED' : 'TENANT_REJECTED',
          targetType: 'Tenant',
          targetId: id,
          detail: {
            previousStatus: tenant.status,
            newStatus,
            reason: dto.reason || null,
          },
        },
      }),
    ]);

    return updated;
  }

  /** Create/update TenantModule records. Remove unlisted. */
  async assignModules(tenantId: string, dto: AssignModulesDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    const { moduleIds } = dto;

    // Validate all modules exist
    if (moduleIds.length > 0) {
      const modules = await this.prisma.module.findMany({
        where: { id: { in: moduleIds } },
      });
      if (modules.length !== moduleIds.length) {
        throw new BadRequestException('部分模块不存在');
      }
    }

    // Get existing TenantModules
    const existing = await this.prisma.tenantModule.findMany({
      where: { tenantId },
    });
    const existingIds = new Set(existing.map((m) => m.moduleId));
    const newIds = new Set(moduleIds);

    // Remove unlisted modules
    const toRemove = [...existingIds].filter((id) => !newIds.has(id));
    if (toRemove.length > 0) {
      await this.prisma.tenantModule.deleteMany({
        where: {
          tenantId,
          moduleId: { in: toRemove },
        },
      });
    }

    // Add new modules
    const toAdd = [...newIds].filter((id) => !existingIds.has(id));
    if (toAdd.length > 0) {
      await this.prisma.tenantModule.createMany({
        data: toAdd.map((moduleId) => ({
          tenantId,
          moduleId,
          status: 'active',
        })),
      });
    }

    // Return updated list
    return this.prisma.tenantModule.findMany({
      where: { tenantId },
      include: { module: true },
    });
  }

  /** Update license: issue (generate new UUID) or revoke (set null) */
  async updateLicense(tenantId: string, dto: UpdateLicenseDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    if (dto.action === 'issue') {
      const licenseKey = crypto.randomUUID();
      return this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          licenseKey,
          expireAt: dto.newExpireAt
            ? new Date(dto.newExpireAt)
            : tenant.expireAt,
        },
      });
    } else {
      // revoke
      return this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          licenseKey: null,
          status: 'expired',
          expireAt: dto.newExpireAt
            ? new Date(dto.newExpireAt)
            : undefined,
        },
      });
    }
  }

  /** Soft delete tenant */
  async deleteTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('租户不存在');
    }

    return this.prisma.tenant.update({
      where: { id },
      data: { status: 'deleted' },
    });
  }

  // ===================== Dashboard =====================

  /** Global dashboard stats */
  async getDashboard() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalActive,
      totalExpired,
      totalDeleted,
      totalUsers,
      todayOrdersCount,
      todayRevenueResult,
      topTenantsRaw,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.tenant.count({ where: { status: 'expired' } }),
      this.prisma.tenant.count({ where: { status: 'deleted' } }),
      this.prisma.user.count({ where: { tenant: { status: { not: 'deleted' } } } }),
      this.prisma.order.count({
        where: {
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
      this.prisma.paymentRecord.aggregate({
        _sum: { amount: true },
        where: {
          status: 'success',
          createdAt: { gte: today, lt: tomorrow },
        },
      }),
      // Top 10 tenants by total revenue (successful payments)
      this.prisma.paymentRecord.groupBy({
        by: ['orderId'],
        _sum: { amount: true },
        where: { status: 'success' },
        orderBy: { _sum: { amount: 'desc' } },
        take: 100,
      }),
    ]);

    // Resolve which tenants the top orders belong to
    const orderIds = topTenantsRaw.map((r) => r.orderId);
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, tenantId: true, totalAmount: true },
    });

    // Aggregate revenue by tenant
    const revenueByTenant = new Map<string, number>();
    for (const o of orders) {
      const current = revenueByTenant.get(o.tenantId) || 0;
      revenueByTenant.set(o.tenantId, current + o.totalAmount);
    }

    // Sort and take top 10
    const topEntries = [...revenueByTenant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Fetch tenant names
    const tenantIds = topEntries.map(([id]) => id);
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, appId: true },
    });

    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const topTenants = topEntries.map(([tenantId, revenue]) => {
      const t = tenantMap.get(tenantId);
      return {
        tenantId,
        name: t?.name || 'Unknown',
        appId: t?.appId || '',
        revenue,
      };
    });

    return {
      tenants: {
        active: totalActive,
        expired: totalExpired,
        deleted: totalDeleted,
        total: totalActive + totalExpired + totalDeleted,
      },
      todayOrders: todayOrdersCount,
      todayRevenue: todayRevenueResult._sum.amount || 0,
      activeUsers: totalUsers,
      topTenants,
    };
  }

  // ===================== Data Correction =====================

  /** Data correction: verifies password, creates AuditLog entry */
  async correctData(operatorId: string, dto: CorrectDataDto) {
    // Password verification — look up the operator in AdminUser table
    const operator = await this.prisma.adminUser.findUnique({
      where: { id: operatorId },
    });

    if (!operator) {
      throw new ForbiddenException('无权执行此操作：操作者不存在');
    }

    // Verify password using simple hash comparison
    // (same pattern as auth service — SHA256)
    const hash = crypto
      .createHash('sha256')
      .update(dto.password)
      .digest('hex');

    if (hash !== operator.passwordHash) {
      throw new ForbiddenException('密码验证失败');
    }

    // Create audit log entry
    await this.prisma.auditLog.create({
      data: {
        tenantId: operator.tenantId,
        operatorId,
        action: 'DATA_CORRECTION',
        targetType: dto.targetType,
        targetId: dto.targetId,
        detail: {
          corrections: dto.corrections,
          reason: dto.reason,
        } as any,
      },
    });

    return {
      message: '数据修正请求已记录',
      targetType: dto.targetType,
      targetId: dto.targetId,
    };
  }

  // ===================== Version Management =====================

  /** List SourceDelivery records grouped by version */
  async getVersions() {
    const deliveries = await this.prisma.sourceDelivery.findMany({
      include: {
        tenant: {
          select: { id: true, name: true, appId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by version
    const grouped = new Map<string, typeof deliveries>();
    for (const d of deliveries) {
      const key = d.version;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(d);
    }

    return [...grouped.entries()].map(([version, items]) => ({
      version,
      count: items.length,
      deliveries: items,
    }));
  }

  /** Create new delivery version record */
  async createDelivery(dto: {
    tenantId: string;
    version: string;
    modules: Record<string, unknown>;
    watermarkId: string;
    checksum?: string;
    deliveredAt?: string;
    expiresAt?: string;
  }) {
    return this.prisma.sourceDelivery.create({
      data: {
        tenantId: dto.tenantId,
        version: dto.version,
        modules: dto.modules as any,
        watermarkId: dto.watermarkId,
        checksum: dto.checksum,
        deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }
}
