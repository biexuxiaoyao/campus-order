import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BrandModule } from './brand/brand.module';
import { CategoryModule } from './category/category.module';
import { DishModule } from './dish/dish.module';
import { SkuModule } from './sku/sku.module';
import { RedisModule } from './redis/redis.module';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { StoreModule } from './store/store.module';
import { UploadModule } from './upload/upload.module';
import { CartModule } from './cart/cart.module';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { PrepaidModule } from './prepaid/prepaid.module';
import { DiscountModule } from './discount/discount.module';
import { PointsModule } from './points/points.module';
import { CouponModule } from './coupon/coupon.module';
import { NotifyModule } from './notify/notify.module';
import { PrinterModule } from './printer/printer.module';
import { GroupOrderModule } from './group-order/group-order.module';
import { AppScheduleModule } from './schedule/schedule.module';
import { SettingsModule } from './settings/settings.module';
import { StaffModule } from './staff/staff.module';
import { AdminModule } from './admin/admin.module';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { TenantGuard } from './common/guards/tenant.guard';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditInterceptor } from './audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuthModule,
    BrandModule,
    CategoryModule,
    DishModule,
    SkuModule,
    AuditModule,
    AppScheduleModule,
    StoreModule,
    UploadModule,
    CartModule,
    UserModule,
    OrderModule,
    PaymentModule,
    PrepaidModule,
    DiscountModule,
    PointsModule,
    CouponModule,
    NotifyModule,
    PrinterModule,
    GroupOrderModule,
    SettingsModule,
    StaffModule,
    AdminModule,
    RedisModule.forRoot(),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
