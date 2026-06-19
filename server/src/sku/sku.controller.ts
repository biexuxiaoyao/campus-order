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
import { SkuService } from './sku.service';
import { CreateSkuDto } from './dto/create-sku.dto';
import { UpdateSkuDto } from './dto/update-sku.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { BatchUpdateStockDto } from './dto/batch-update-stock.dto';
import { CreateSpecTemplateDto } from './dto/create-spec-template.dto';
import { UpdateSpecTemplateDto } from './dto/update-spec-template.dto';

@Controller('api/merchant')
export class SkuController {
  constructor(private sku: SkuService) {}

  // ==================== SKU ====================

  @Get('dishes/:dishId/skus')
  async findByDish(@Param('dishId') dishId: string) {
    return this.sku.findByDish(dishId);
  }

  @Post('dishes/:dishId/skus')
  async create(@Param('dishId') dishId: string, @Body() dto: CreateSkuDto) {
    return this.sku.create(dishId, dto);
  }

  @Put('skus/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateSkuDto) {
    return this.sku.update(id, dto);
  }

  @Delete('skus/:id')
  async remove(@Param('id') id: string) {
    return this.sku.remove(id);
  }

  @Put('skus/:id/stock')
  async updateStock(@Param('id') id: string, @Body() dto: UpdateStockDto) {
    return this.sku.updateStock(id, dto.stock, dto.availableStock, dto.version);
  }

  @Post('skus/batch-stock')
  async batchUpdateStock(@Body() dto: BatchUpdateStockDto) {
    return this.sku.batchUpdateStock(dto.items);
  }

  // ==================== SpecTemplate ====================

  @Get('stores/:storeId/spec-templates')
  async findTemplates(@Param('storeId') storeId: string) {
    return this.sku.findTemplates(storeId);
  }

  @Post('stores/:storeId/spec-templates')
  async createTemplate(
    @Param('storeId') storeId: string,
    @Body() dto: CreateSpecTemplateDto,
  ) {
    return this.sku.createTemplate(storeId, dto);
  }

  @Put('spec-templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateSpecTemplateDto,
  ) {
    return this.sku.updateTemplate(id, dto);
  }

  @Delete('spec-templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    return this.sku.deleteTemplate(id);
  }
}
