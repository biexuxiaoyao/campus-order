import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Headers,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotifyPrefsDto } from './dto/update-notify-prefs.dto';

@Controller('api/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.userService.getProfile(req.user.userId);
  }

  @Put('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  @Get('notify-prefs')
  async getNotifyPrefs(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.userService.getNotificationPrefs(req.user.userId, tenantId);
  }

  @Put('notify-prefs')
  async updateNotifyPrefs(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: UpdateNotifyPrefsDto,
  ) {
    return this.userService.updateNotificationPrefs(
      req.user.userId,
      tenantId,
      dto,
    );
  }

  @Post('export-data')
  async exportData(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.userService.requestDataExport(req.user.userId, tenantId);
  }

  @Post('deactivate')
  async deactivate(@Req() req: any) {
    return this.userService.deactivateAccount(req.user.userId);
  }
}
