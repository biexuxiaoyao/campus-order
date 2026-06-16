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
import { DiscountService } from './discount.service';
import { CreateDiscountRuleDto } from './dto/create-discount-rule.dto';
import { UpdateDiscountRuleDto } from './dto/update-discount-rule.dto';

@Controller('api/merchant')
export class DiscountController {
  constructor(private discount: DiscountService) {}

  @Get('stores/:storeId/discounts')
  async findAll(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.discount.findAll(storeId);
  }

  @Post('stores/:storeId/discounts')
  async create(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
    @Body() dto: CreateDiscountRuleDto,
  ) {
    return this.discount.create(storeId, dto);
  }

  @Get('discounts/:id')
  async findOne(@Param('id') id: string) {
    return this.discount.findOne(id);
  }

  @Put('discounts/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDiscountRuleDto,
  ) {
    return this.discount.update(id, dto);
  }

  @Delete('discounts/:id')
  async remove(@Param('id') id: string) {
    return this.discount.remove(id);
  }
}
