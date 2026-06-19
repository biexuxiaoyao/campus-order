import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('wechat-login')
  async wechatLogin(
    @Body('code') code: string,
    @Headers('x-app-id') appId: string,
  ) {
    return this.auth.wechatLogin(code, appId);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refreshToken(refreshToken);
  }

  @Public()
  @Post('admin-login')
  async adminLogin(
    @Body('username') username: string,
    @Body('password') password: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.auth.adminLogin(username, password, tenantId);
  }

  @Post('admin-logout')
  adminLogout() {
    return { message: '已退出' };
  }

  @Get('admin-profile')
  @UseGuards(AuthGuard('jwt'))
  async adminProfile(@Req() req: any) {
    return this.auth.getAdminProfile(req.user?.userId);
  }
}
