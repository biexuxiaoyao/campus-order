import {
  Controller,
  Get,
  Post,
  Body,
  Query,
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
  async getSummary(@Req() req: any) {
    return this.points.getSummary(req.user?.userId, req.tenantId);
  }

  @Post('sign-in')
  async signIn(@Req() req: any) {
    return this.points.signIn(req.user?.userId, req.tenantId);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: any,
    @Query() query: { page?: number; pageSize?: number },
  ) {
    return this.points.getTransactions(req.user?.userId, req.tenantId, query);
  }

  @Post('exchange')
  exchange(@Req() req: any, @Body() dto: ExchangeDto) {
    return this.points.exchange(req.user?.userId, req.tenantId, dto);
  }
}
