import { Controller, Get, Put, Body, Headers } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Controller('api/merchant')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  @Get('settings')
  async getSettings(@Headers('x-tenant-id') tenantId: string) {
    return this.settings.getSettings(tenantId);
  }

  @Put('settings')
  async updateSettings(
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.settings.updateSettings(tenantId, dto);
  }
}
