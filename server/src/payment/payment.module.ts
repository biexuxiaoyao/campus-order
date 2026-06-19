import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { WechatPayConfig } from './wechat-pay.config';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    PrismaModule,
    NotifyModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, WechatPayConfig],
  exports: [PaymentService],
})
export class PaymentModule {}
