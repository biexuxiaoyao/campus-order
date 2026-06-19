import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Query,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { BatchSortDto } from './dto/batch-sort.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('api/merchant')
export class CategoryController {
  constructor(private category: CategoryService) {}

  @Get('stores/:storeId/categories')
  async findAll(
    @Param('storeId') storeId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.category.findAll(storeId, pagination);
  }

  @Post('stores/:storeId/categories')
  async create(
    @Param('storeId') storeId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.category.create(storeId, dto);
  }

  @Put('categories/batch-sort')
  async batchSort(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: BatchSortDto,
  ) {
    return this.category.batchSort(dto.items);
  }

  @Put('categories/:id')
  async update(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.category.update(id, dto);
  }

  @Delete('categories/:id')
  async remove(
    @Param('id') id: string,
    @Headers('x-tenant-id') _tenantId: string,
  ) {
    return this.category.remove(id);
  }
}
