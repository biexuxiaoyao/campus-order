import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyModule } from '../notify/notify.module';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

@Module({
  imports: [PrismaModule, NotifyModule],
  controllers: [GroupOrderController],
  providers: [GroupOrderService],
  exports: [GroupOrderService],
})
export class GroupOrderModule {}
