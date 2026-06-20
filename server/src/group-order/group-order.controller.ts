import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
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
  async listPools(@Req() req: any, @Query('storeId') storeId: string) {
    return this.groupOrderService.getPool(req.tenantId, storeId);
  }

  /** Get group order detail */
  @Get('group-orders/:id')
  async getDetail(@Param('id') id: string) {
    return this.groupOrderService.getDetail(id);
  }

  /** Create a pooling group order */
  @Post('group-orders')
  @UseGuards(AuthGuard('jwt'))
  async createPool(@Req() req: any, @Body() dto: CreateGroupOrderDto) {
    const leaderId = req.user?.userId;
    return this.groupOrderService.createPool(leaderId, req.tenantId, dto);
  }

  /** Join a pooling group order */
  @Post('group-orders/:id/join')
  @UseGuards(AuthGuard('jwt'))
  async joinPool(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: JoinGroupOrderDto,
  ) {
    return this.groupOrderService.joinPool(id, req.user?.userId, dto);
  }

  /** Close a pooling group order (leader only) */
  @Put('group-orders/:id/close')
  @UseGuards(AuthGuard('jwt'))
  async closePool(@Req() req: any, @Param('id') id: string) {
    return this.groupOrderService.closePool(id, req.user?.userId);
  }

  /** Create a represent order (leader orders on behalf of others) */
  @Post('group-orders/represent')
  @UseGuards(AuthGuard('jwt'))
  async representOrder(@Req() req: any, @Body() dto: RepresentOrderDto) {
    return this.groupOrderService.representOrder(
      req.user?.userId,
      req.tenantId,
      dto,
    );
  }
}
