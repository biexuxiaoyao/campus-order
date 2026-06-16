import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GroupOrderController],
  providers: [GroupOrderService],
  exports: [GroupOrderService],
})
export class GroupOrderModule {}
