import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CouponService } from './coupon.service';
import { CreateCouponTemplateDto } from './dto/create-coupon-template.dto';
import { UpdateCouponTemplateDto } from './dto/update-coupon-template.dto';

/** 商家端：优惠券模板管理 */
@Controller('api/merchant')
export class CouponMerchantController {
  constructor(private coupon: CouponService) {}

  @Get('stores/:storeId/coupon-templates')
  async findTemplates(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.coupon.findTemplates(storeId);
  }

  @Post('stores/:storeId/coupon-templates')
  async createTemplate(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
    @Body() dto: CreateCouponTemplateDto,
  ) {
    return this.coupon.createTemplate(storeId, dto);
  }

  @Put('coupon-templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateCouponTemplateDto,
  ) {
    return this.coupon.updateTemplate(id, dto);
  }

  @Delete('coupon-templates/:id')
  async removeTemplate(@Param('id') id: string) {
    return this.coupon.removeTemplate(id);
  }
}

/** C 端：用户领券/查券 */
@Controller('api')
@UseGuards(AuthGuard('jwt'))
export class CouponController {
  constructor(private coupon: CouponService) {}

  @Get('coupons')
  async getUserCoupons(@Req() req: any, @Query('status') status?: string) {
    return this.coupon.getUserCoupons(req.user?.userId, status);
  }

  @Get('coupons/available')
  async getAvailableForOrder(
    @Req() req: any,
    @Query('orderAmount') orderAmount: string,
  ) {
    const amount = parseInt(orderAmount, 10) || 0;
    return this.coupon.getAvailableForOrder(req.user?.userId, amount);
  }

  /** 可领取的优惠券模板列表 */
  @Get('coupons/claimable')
  async getClaimable(@Req() req: any, @Query('storeId') storeId: string) {
    return this.coupon.getClaimableTemplates(storeId, req.user?.userId);
  }

  @Post('coupons/:id/claim')
  async claim(@Req() req: any, @Param('id') templateId: string) {
    return this.coupon.claim(req.user?.userId, templateId);
  }
}
