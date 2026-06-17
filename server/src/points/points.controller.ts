import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PointsService } from './points.service';
import { ExchangeDto } from './dto/exchange.dto';

@Controller('api/points')
@UseGuards(AuthGuard('jwt'))
export class PointsController {
  constructor(private points: PointsService) {}

  @Get('summary')
  async getSummary(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.points.getSummary(req.user?.userId, tenantId);
  }

  @Post('sign-in')
  async signIn(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.points.signIn(req.user?.userId, tenantId);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Query() query: { page?: number; pageSize?: number },
  ) {
    return this.points.getTransactions(req.user?.userId, tenantId, query);
  }

  @Post('exchange')
  async exchange(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: ExchangeDto,
  ) {
    return this.points.exchange(req.user?.userId, tenantId, dto);
  }
}
