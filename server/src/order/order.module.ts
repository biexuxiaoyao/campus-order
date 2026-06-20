import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { PaymentModule } from '../payment/payment.module';
import { OrderService } from './order.service';
import { OrderController, OrderMerchantController } from './order.controller';

@Module({
  imports: [PrismaModule, NotifyModule, PaymentModule],
  controllers: [OrderController, OrderMerchantController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
