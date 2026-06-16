import { Module } from '@nestjs/common';
import { GroupOrderService } from './group-order.service';
import { GroupOrderController } from './group-order.controller';

@Module({
  providers: [GroupOrderService],
  controllers: [GroupOrderController],
  exports: [GroupOrderService],
})
export class GroupOrderModule {}
