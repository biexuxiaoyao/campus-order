import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponService } from './coupon.service';
import { CouponController, CouponMerchantController } from './coupon.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CouponController, CouponMerchantController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
