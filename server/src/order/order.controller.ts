import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

/** C-end: customer-facing order endpoints */
@Controller('api')
@UseGuards(AuthGuard('jwt'))
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post('orders')
  async create(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user?.userId;
    const tenantId = req.tenantId;
    return this.orderService.create(userId, tenantId, dto);
  }

  @Get('orders')
  async findAll(@Req() req: any, @Query() query: QueryOrderDto) {
    const userId = req.user?.userId;
    const tenantId = req.tenantId;
    return this.orderService.findAll(tenantId, userId, query);
  }

  @Get('orders/:id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.orderService.findOne(id, userId);
  }

  @Post('orders/:id/cancel')
  async cancel(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.orderService.cancel(id, userId);
  }

  @Post('orders/:id/reorder')
  async reorder(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.orderService.reorder(id, userId);
  }

  @Post('orders/:id/urge')
  async urge(@Req() req: any, @Param('id') id: string) {
    const userId = req.user?.userId;
    return this.orderService.urge(id, userId);
  }

  @Post('orders/:id/refund')
  async requestRefund(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      items?: { orderItemId: string; quantity: number }[];
      reason?: string;
    },
  ) {
    const userId = req.user?.userId;
    return this.orderService.requestRefund(id, userId, body.items, body.reason);
  }
}

/** Merchant-facing order management endpoints */
@Controller('api/merchant')
@UseGuards(AuthGuard('jwt'))
export class OrderMerchantController {
  constructor(private orderService: OrderService) {}

  @Get('orders')
  async findByStore(
    @Headers('x-tenant-id') tenantId: string,
    @Query('storeId') storeId: string,
    @Query() query: any,
  ) {
    return this.orderService.findByStore(storeId, tenantId, query);
  }

  @Get('orders/:id')
  async findOne(
    @Headers('x-tenant-id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.orderService.findOneForMerchant(id, tenantId);
  }

  @Put('orders/:id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    const operatorId = req.user?.userId;
    return this.orderService.updateStatus(
      id,
      dto.status,
      operatorId,
      dto.reason,
    );
  }

  @Post('orders/:id/refund/approve')
  async approveRefund(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { approved: boolean; reason?: string },
  ) {
    const operatorId = req.user?.userId;
    return this.orderService.approveRefund(
      id,
      body.approved,
      operatorId,
      body.reason,
    );
  }

  @Post('orders/batch-confirm')
  async batchConfirm(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { storeId: string; orderIds: string[] },
  ) {
    const operatorId = req.user?.userId;
    return this.orderService.batchConfirm(
      body.storeId,
      body.orderIds,
      operatorId,
    );
  }
}
