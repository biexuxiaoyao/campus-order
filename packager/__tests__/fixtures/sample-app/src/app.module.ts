import { Module } from '@nestjs/common';
import { GroupOrderModule } from './group-order/group-order.module';
import { PrepaidModule } from './prepaid/prepaid.module';
import { DiscountModule } from './discount/discount.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [GroupOrderModule, PrepaidModule, DiscountModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
