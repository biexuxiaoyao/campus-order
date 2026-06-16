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
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ReviewTenantDto } from './dto/review-tenant.dto';
import { AssignModulesDto } from './dto/assign-modules.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { CorrectDataDto } from './dto/correct-data.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';
import { CreateDeliveryDto } from './dto/create-delivery.dto';

@Controller('api/admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private admin: AdminService) {}

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
  async updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
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
  async assignModules(
    @Param('id') id: string,
    @Body() dto: AssignModulesDto,
  ) {
    return this.admin.assignModules(id, dto);
  }

  /** PUT /api/admin/tenants/:id/license — Update license */
  @Put('tenants/:id/license')
  async updateLicense(
    @Param('id') id: string,
    @Body() dto: UpdateLicenseDto,
  ) {
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
  async correctData(
    @Body() dto: CorrectDataDto,
    @Req() req: any,
  ) {
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
}
