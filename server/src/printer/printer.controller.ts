import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
} from '@nestjs/common';
import { PrinterService } from './printer.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';

@Controller('api/merchant')
export class PrinterController {
  constructor(private readonly printer: PrinterService) {}

  /** 查询门店打印机列表 */
  @Get('stores/:storeId/printers')
  async getPrinters(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.printer.getPrinters(storeId);
  }

  /** 新增打印机 */
  @Post('stores/:storeId/printers')
  async addPrinter(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('storeId') storeId: string,
    @Body() dto: CreatePrinterDto,
  ) {
    return this.printer.addPrinter(storeId, dto);
  }

  /** 更新打印机 */
  @Put('printers/:id')
  async updatePrinter(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePrinterDto,
  ) {
    return this.printer.updatePrinter(id, dto);
  }

  /** 删除打印机 */
  @Delete('printers/:id')
  async deletePrinter(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('id') id: string,
  ) {
    return this.printer.deletePrinter(id);
  }

  /** 打印订单小票 */
  @Post('orders/:id/print')
  printOrder(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('id') orderId: string,
  ) {
    // 注意：实际使用时需要先从 OrderService 获取订单详情
    // 此处为占位实现，返回提示信息
    return {
      message: '请通过 PrinterService.printOrder(storeId, order) 方法调用打印',
      orderId,
    };
  }

  /** 补打订单小票 */
  @Post('orders/:id/reprint')
  reprintOrder(
    @Headers('x-tenant-id') _tenantId: string,
    @Param('id') orderId: string,
  ) {
    return {
      message:
        '请通过 PrinterService.reprintOrder(storeId, order) 方法调用补打',
      orderId,
    };
  }
}
