import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { KitchenService } from './kitchen.service';
import { BatchUpdateDto } from './dto/batch-update.dto';

@Controller('api/merchant/kitchen')
@UseGuards(AuthGuard('jwt'))
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  /** Get orders grouped by status for kitchen display board */
  @Get('orders')
  async getOrders(
    @Headers('x-tenant-id') tenantId: string,
    @Req() req: any,
  ) {
    const storeId = req.query.storeId;
    if (!storeId) {
      // Return empty result gracefully — frontend may pass empty string when store not yet selected
      return { pending: [], pendingCount: 0, cooking: [], cookingCount: 0, ready: [], readyCount: 0, total: 0 };
    }
    return this.kitchen.getKitchenOrders(storeId, tenantId);
  }

  /** Batch start cooking (confirmed → cooking) */
  @Post('batch-start')
  async batchStart(
    @Req() req: any,
    @Body() dto: BatchUpdateDto,
  ) {
    const operatorId = req.user?.userId;
    return this.kitchen.batchStartCooking(
      dto.storeId,
      dto.orderIds,
      operatorId,
    );
  }

  /** Batch mark ready (cooking → ready, generates pickupNo) */
  @Post('batch-ready')
  async batchReady(
    @Req() req: any,
    @Body() dto: BatchUpdateDto,
  ) {
    const operatorId = req.user?.userId;
    return this.kitchen.batchMarkReady(
      dto.storeId,
      dto.orderIds,
      operatorId,
    );
  }

  /** Batch pickup (ready → picked) */
  @Post('batch-pickup')
  async batchPickup(
    @Req() req: any,
    @Body() dto: BatchUpdateDto,
  ) {
    const operatorId = req.user?.userId;
    return this.kitchen.batchPickup(dto.storeId, dto.orderIds, operatorId);
  }
}
