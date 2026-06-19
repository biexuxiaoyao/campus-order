import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';
import { PackagerService } from './packager.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ReviewTenantDto } from './dto/review-tenant.dto';
import { AssignModulesDto } from './dto/assign-modules.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { CorrectDataDto } from './dto/correct-data.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDocumentsDto } from './dto/update-documents.dto';
import { Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';

@Controller('api/admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(
    private admin: AdminService,
    private packager: PackagerService,
  ) {}

  // ===================== Tenant Management =====================

  /** GET /api/admin/tenants — Paginated list with filters */
  @Get('tenants')
  async listTenants(@Query() query: QueryTenantDto) {
    return this.admin.listTenants(query);
  }

  /** GET /api/admin/tenants/:id — Full detail */
  @Get('tenants/:id')
  async getTenant(@Param('id') id: string) {
    return this.admin.getTenant(id);
  }

  /** POST /api/admin/tenants — Create tenant */
  @Post('tenants')
  async createTenant(@Body() dto: CreateTenantDto) {
    return this.admin.createTenant(dto);
  }

  /** PUT /api/admin/tenants/:id — Update tenant */
  @Put('tenants/:id')
  async updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.admin.updateTenant(id, dto);
  }

  /** POST /api/admin/tenants/:id/review — Review (approve/reject) tenant */
  @Post('tenants/:id/review')
  async reviewTenant(
    @Param('id') id: string,
    @Body() dto: ReviewTenantDto,
    @Req() req: any,
  ) {
    return this.admin.reviewTenant(id, dto, req.user.userId);
  }

  /** PUT /api/admin/tenants/:id/modules — Assign modules */
  @Put('tenants/:id/modules')
  async assignModules(@Param('id') id: string, @Body() dto: AssignModulesDto) {
    return this.admin.assignModules(id, dto);
  }

  /** PUT /api/admin/tenants/:id/license — Update license */
  @Put('tenants/:id/license')
  async updateLicense(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.admin.updateLicense(id, dto);
  }

  /** DELETE /api/admin/tenants/:id — Soft delete */
  @Delete('tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    return this.admin.deleteTenant(id);
  }

  // ===================== Dashboard =====================

  /** GET /api/admin/dashboard — Global stats */
  @Get('dashboard')
  async getDashboard() {
    return this.admin.getDashboard();
  }

  // ===================== Data Correction =====================

  /** POST /api/admin/orders/correct — Data correction */
  @Post('orders/correct')
  async correctData(@Body() dto: CorrectDataDto, @Req() req: any) {
    return this.admin.correctData(req.user.userId, dto);
  }

  // ===================== Version Management =====================

  /** GET /api/admin/versions — List delivery versions */
  @Get('versions')
  async getVersions() {
    return this.admin.getVersions();
  }

  /** POST /api/admin/versions — Create delivery record */
  @Post('versions')
  async createDelivery(@Body() dto: CreateDeliveryDto) {
    return this.admin.createDelivery(dto);
  }

  // ===================== Source Delivery =====================

  /** POST /api/admin/tenants/:id/source-quote — Get incremental delivery price */
  @Post('tenants/:id/source-quote')
  async getSourceQuote(@Param('id') id: string) {
    return this.admin.getSourceQuote(id);
  }

  /** POST /api/admin/tenants/:id/source-delivery — Execute source delivery */
  @Post('tenants/:id/source-delivery')
  async executeSourceDelivery(@Param('id') id: string) {
    const result = await this.admin.executeSourceDelivery(id);
    // Trigger packager asynchronously (don't block response)
    if (result.deliveryId) {
      this.packager.executeDelivery(result.deliveryId).catch((err) => {
        console.error(`[Packager] Delivery ${result.deliveryId} failed:`, err.message);
      });
    }
    return result;
  }

  /** GET /api/admin/source-delivery/:id/download — Download delivery zip */
  @Get('source-delivery/:id/download')
  async downloadDelivery(@Param('id') id: string, @Res() res: Response) {
    const filePath = this.packager.getDownloadPath(id);
    if (!require('fs').existsSync(filePath)) {
      res.status(404).json({ code: 'NOT_FOUND', message: '交付包尚未生成或已过期' });
      return;
    }
    const file = createReadStream(filePath);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="delivery-${id}.zip"`,
    });
    file.pipe(res);
  }

  /** GET /api/admin/tenants/:id/source-deliveries — Delivery history */
  @Get('tenants/:id/source-deliveries')
  async getSourceDeliveries(@Param('id') id: string) {
    return this.admin.getSourceDeliveries(id);
  }

  // ===================== Tenant Documents =====================

  /** PUT /api/admin/tenants/:id/documents — Update review documents */
  @Put('tenants/:id/documents')
  async updateDocuments(@Param('id') id: string, @Body() dto: UpdateDocumentsDto) {
    return this.admin.updateDocuments(id, dto);
  }

  // ===================== Module Purchases =====================

  /** GET /api/admin/tenants/:id/purchases — Get module purchase history */
  @Get('tenants/:id/purchases')
  async getPurchases(@Param('id') id: string) {
    return this.admin.getPurchases(id);
  }
}
