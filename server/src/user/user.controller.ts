import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateNotifyPrefsDto } from './dto/update-notify-prefs.dto';

@Controller('api/user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.userService.getProfile(req.user?.userId);
  }

  @Put('profile')
  async updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user?.userId, dto);
  }

  @Get('notify-prefs')
  async getNotifyPrefs(@Req() req: any) {
    return this.userService.getNotificationPrefs(req.user?.userId, req.tenantId);
  }

  @Put('notify-prefs')
  async updateNotifyPrefs(@Req() req: any, @Body() dto: UpdateNotifyPrefsDto) {
    return this.userService.updateNotificationPrefs(req.user?.userId, req.tenantId, dto);
  }

  @Post('export-data')
  async exportData(@Req() req: any) {
    return this.userService.requestDataExport(req.user?.userId, req.tenantId);
  }

  @Post('deactivate')
  deactivate(@Req() req: any) {
    return this.userService.deactivateAccount(req.user?.userId);
  }
}
