import { Controller, Post, Body, Headers, Req } from '@nestjs/common';
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
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.auth.adminLogin(username, password, tenantId);
  }
}
