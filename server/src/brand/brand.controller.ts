import { Controller, Get, Put, Body, Headers, Req } from '@nestjs/common';
import { BrandService } from './brand.service';
import { UpdateBrandConfigDto } from './dto/update-brand-config.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/brand')
export class BrandController {
  constructor(private brand: BrandService) {}

  @Public()
  @Get('config')
  async getConfig(@Headers('x-tenant-id') tenantId: string, @Req() req: any) {
    // 优先使用 header 中的 tenantId，其次使用中间件从 x-app-id 解析的 tenantId
    const tid = tenantId || req.tenantId;
    return this.brand.getConfig(tid);
  }

  @Put('config')
  async updateConfig(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateBrandConfigDto,
  ) {
    return this.brand.updateConfig(tenantId, dto);
  }
}
