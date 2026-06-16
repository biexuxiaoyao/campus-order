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
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Controller('api/merchant')
export class StoreController {
  constructor(private store: StoreService) {}

  @Get('stores')
  async findAll(@Headers('x-tenant-id') tenantId: string) {
    return this.store.findAll(tenantId);
  }

  @Get('stores/:id')
  async findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.store.findOne(tenantId, id);
  }

  @Post('stores')
  async create(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateStoreDto,
  ) {
    return this.store.create(tenantId, dto);
  }

  @Put('stores/:id')
  async update(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.store.update(tenantId, id, dto);
  }

  @Delete('stores/:id')
  async remove(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.store.remove(tenantId, id);
  }
}
