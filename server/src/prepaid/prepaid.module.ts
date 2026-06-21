import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentModule } from '../payment/payment.module';
import { PrepaidService } from './prepaid.service';
import { PrepaidController } from './prepaid.controller';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    forwardRef(() => PaymentModule),
  ],
  controllers: [PrepaidController],
  providers: [PrepaidService],
  exports: [PrepaidService],
})
export class PrepaidModule {}
