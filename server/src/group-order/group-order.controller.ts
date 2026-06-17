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
import { GroupOrderService } from './group-order.service';
import { CreateGroupOrderDto } from './dto/create-group-order.dto';
import { JoinGroupOrderDto } from './dto/join-group-order.dto';
import { RepresentOrderDto } from './dto/represent-order.dto';

/** C-end: group-order endpoints */
@Controller('api')
export class GroupOrderController {
  constructor(private groupOrderService: GroupOrderService) {}

  /** List active pools for a store */
  @Get('group-orders')
  async listPools(
    @Headers('x-tenant-id') tenantId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.groupOrderService.getPool(tenantId, storeId);
  }

  /** Get group order detail */
  @Get('group-orders/:id')
  async getDetail(@Param('id') id: string) {
    return this.groupOrderService.getDetail(id);
  }

  /** Create a pooling group order */
  @Post('group-orders')
  @UseGuards(AuthGuard('jwt'))
  async createPool(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: CreateGroupOrderDto,
  ) {
    const leaderId = req.user?.userId;
    return this.groupOrderService.createPool(leaderId, tenantId, dto);
  }

  /** Join a pooling group order */
  @Post('group-orders/:id/join')
  @UseGuards(AuthGuard('jwt'))
  async joinPool(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: JoinGroupOrderDto,
  ) {
    const userId = req.user?.userId;
    return this.groupOrderService.joinPool(id, userId, dto);
  }

  /** Close a pooling group order (leader only) */
  @Put('group-orders/:id/close')
  @UseGuards(AuthGuard('jwt'))
  async closePool(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const leaderId = req.user?.userId;
    return this.groupOrderService.closePool(id, leaderId);
  }

  /** Create a represent order (leader orders on behalf of others) */
  @Post('group-orders/represent')
  @UseGuards(AuthGuard('jwt'))
  async representOrder(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: RepresentOrderDto,
  ) {
    const leaderId = req.user?.userId;
    return this.groupOrderService.representOrder(leaderId, tenantId, dto);
  }
}
