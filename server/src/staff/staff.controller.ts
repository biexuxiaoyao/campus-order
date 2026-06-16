import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LockAccountDto } from './dto/lock-account.dto';

@Controller('api/merchant/staff')
export class StaffController {
  constructor(private staff: StaffService) {}

  @Get()
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.staff.findAll(tenantId);
  }

  @Get(':id')
  async findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.staff.findOne(tenantId, id);
  }

  @Post()
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.staff.create(tenantId, dto);
  }

  @Put(':id')
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(tenantId, id, dto);
  }

  @Delete(':id')
  async remove(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.staff.remove(tenantId, id);
  }

  @Post(':id/reset-password')
  async resetPassword(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.staff.resetPassword(tenantId, id, dto.newPassword);
  }

  @Post(':id/lock')
  async lockAccount(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: LockAccountDto,
  ) {
    return this.staff.lockAccount(tenantId, id, dto.minutes);
  }

  @Post(':id/unlock')
  async unlockAccount(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.staff.unlockAccount(tenantId, id);
  }
}
