import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { PaymentModule } from '../payment/payment.module';
import { GroupOrderModule } from '../group-order/group-order.module';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    NotifyModule,
    PaymentModule,
    GroupOrderModule,
  ],
  providers: [ScheduleService],
})
export class AppScheduleModule {}
