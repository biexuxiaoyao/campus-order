import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, NotifyModule],
  providers: [ScheduleService],
})
export class AppScheduleModule {}
