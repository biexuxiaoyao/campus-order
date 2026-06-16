import { Controller, Get, Put, Body, Headers } from '@nestjs/common';
import { BrandService } from './brand.service';
import { UpdateBrandConfigDto } from './dto/update-brand-config.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/brand')
export class BrandController {
  constructor(private brand: BrandService) {}

  @Public()
  @Get('config')
  async getConfig(@Headers('x-tenant-id') tenantId: string) {
    return this.brand.getConfig(tenantId);
  }

  @Put('config')
  async updateConfig(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateBrandConfigDto,
  ) {
    return this.brand.updateConfig(tenantId, dto);
  }
}
