import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { PrepaidModule } from '../prepaid/prepaid.module';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { WechatPayConfig } from './wechat-pay.config';
import { WechatPayClient } from './wechat-pay.client';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    NotifyModule,
    forwardRef(() => PrepaidModule),
  ],
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayConfig, WechatPayClient],
  exports: [PaymentService, WechatPayConfig, WechatPayClient],
})
export class PaymentModule {}
