import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { PaymentModule } from '../payment/payment.module';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

@Module({
  imports: [PrismaModule, NotifyModule, forwardRef(() => PaymentModule)],
  controllers: [GroupOrderController],
  providers: [GroupOrderService],
  exports: [GroupOrderService],
})
export class GroupOrderModule {}
