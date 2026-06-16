import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderService } from './order.service';
import { OrderController, OrderMerchantController } from './order.controller';

@Module({
  imports: [PrismaModule],
  controllers: [OrderController, OrderMerchantController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
