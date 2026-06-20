import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { YilianyunService } from './yilianyun.service';
import { CreatePrinterDto } from './dto/create-printer.dto';
import { UpdatePrinterDto } from './dto/update-printer.dto';

/** 58mm 热敏小票行宽（半角字符数） */
const LINE_WIDTH = 32;

/** 生成分隔线 */
function divider(char = '-'): string {
  return char.repeat(LINE_WIDTH);
}

/** 两端对齐：left 靠左，right 靠右 */
function padBoth(left: string, right: string): string {
  const total = left.length + right.length;
  if (total >= LINE_WIDTH) return `${left} ${right}`;
  const spaces = LINE_WIDTH - total;
  return `${left}${' '.repeat(spaces)}${right}`;
}

/** 居中文本 */
function center(text: string): string {
  const len = text.length;
  if (len >= LINE_WIDTH) return text;
  const leftPad = Math.floor((LINE_WIDTH - len) / 2);
  return ' '.repeat(leftPad) + text;
}

@Injectable()
export class PrinterService {
  private readonly logger = new Logger(PrinterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly yilianyun: YilianyunService,
  ) {}

  // ==================== CRUD ====================

  /** 新增打印机 */
  async addPrinter(storeId: string, dto: CreatePrinterDto) {
    return this.prisma.printer.create({
      data: {
        storeId,
        brand: dto.brand,
        deviceId: dto.deviceId,
        apiKey: dto.apiKey,
        status: 'active',
      },
    });
  }

  /** 查询门店所有打印机 */
  async getPrinters(storeId: string) {
    return this.prisma.printer.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 更新打印机信息 */
  async updatePrinter(id: string, dto: UpdatePrinterDto) {
    const printer = await this.prisma.printer.findUnique({ where: { id } });
    if (!printer) {
      throw new NotFoundException('打印机不存在');
    }

    return this.prisma.printer.update({
      where: { id },
      data: dto,
    });
  }

  /** 删除打印机（软删除，标记为 inactive） */
  async deletePrinter(id: string) {
    const printer = await this.prisma.printer.findUnique({ where: { id } });
    if (!printer) {
      throw new NotFoundException('打印机不存在');
    }

    return this.prisma.printer.update({
      where: { id },
      data: { status: 'inactive' },
    });
  }

  /** 检查打印机在线状态 */
  getPrintStatus(_printerId: string): { online: boolean; message: string } {
    // TODO: 调用各品牌云打印机状态查询 API
    this.logger.log(`[Printer] 查询打印机状态: ${_printerId}`);
    return { online: true, message: '暂未对接状态查询 API' };
  }

  // ==================== 打印 ====================

  /**
   * 打印订单小票
   * @param storeId 门店 ID
   * @param order   订单数据（含 items）
   * @param reprint 是否补打（会加"补打"水印）
   */
  async printOrder(
    storeId: string,
    order: {
      orderNo: string;
      pickupNo?: string | null;
      totalAmount: number;
      remark?: string | null;
      createdAt: Date | string;
      items: {
        dishName: string;
        specName: string;
        price: number;
        quantity: number;
      }[];
      store?: { name?: string };
    },
    reprint = false,
  ): Promise<{
    success: boolean;
    results: { printerId: string; brand: string; sent: boolean }[];
  }> {
    // 1. 查询门店所有活跃打印机
    const printers = await this.prisma.printer.findMany({
      where: { storeId, status: 'active' },
    });

    if (printers.length === 0) {
      this.logger.warn(`[Printer] 门店 ${storeId} 无可用打印机`);
      return { success: false, results: [] };
    }

    // 2. 构建打印内容
    const content = this.buildPrintContent(order, reprint);

    // 3. 逐台打印机发送
    const results: { printerId: string; brand: string; sent: boolean }[] = [];

    for (const printer of printers) {
      try {
        await this.sendToCloudPrinter(
          printer.brand,
          printer.deviceId,
          printer.apiKey,
          content,
        );
        results.push({
          printerId: printer.id,
          brand: printer.brand,
          sent: true,
        });
        this.logger.log(
          `[Printer] 打印成功 — printer: ${printer.id} (${printer.brand}), order: ${order.orderNo}`,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[Printer] 打印失败 — printer: ${printer.id} (${printer.brand}), error: ${message}`,
        );
        results.push({
          printerId: printer.id,
          brand: printer.brand,
          sent: false,
        });
      }
    }

    return { success: results.some((r) => r.sent), results };
  }

  /** 补打订单小票（带"补打"水印） */
  async reprintOrder(
    storeId: string,
    order: {
      orderNo: string;
      pickupNo?: string | null;
      totalAmount: number;
      remark?: string | null;
      createdAt: Date | string;
      items: {
        dishName: string;
        specName: string;
        price: number;
        quantity: number;
      }[];
      store?: { name?: string };
    },
  ): Promise<{
    success: boolean;
    results: { printerId: string; brand: string; sent: boolean }[];
  }> {
    return this.printOrder(storeId, order, true);
  }

  // ==================== 打印内容构建 ====================

  /**
   * 构建 58mm 热敏小票打印内容
   */
  private buildPrintContent(
    order: {
      orderNo: string;
      pickupNo?: string | null;
      totalAmount: number;
      remark?: string | null;
      createdAt: Date | string;
      items: {
        dishName: string;
        specName: string;
        price: number;
        quantity: number;
      }[];
      store?: { name?: string };
    },
    reprint: boolean,
  ): string {
    const lines: string[] = [];
    const createdAt =
      typeof order.createdAt === 'string'
        ? new Date(order.createdAt)
        : order.createdAt;

    // 补打水印
    if (reprint) {
      lines.push('');
      lines.push(center('【 补 打 】'));
      lines.push('');
    }

    // 店名
    lines.push(center(order.store?.name || '校园订餐'));
    lines.push(divider('='));

    // 订单信息
    lines.push(`订单号: ${order.orderNo}`);
    if (order.pickupNo) {
      lines.push(`取餐号: ${order.pickupNo}`);
    }
    lines.push(
      `时间: ${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}:${String(createdAt.getSeconds()).padStart(2, '0')}`,
    );
    lines.push(divider());

    // 表头
    lines.push(padBoth('菜品', '数量/单价'));
    lines.push(divider('-'));

    // 菜品列表
    for (const item of order.items) {
      const name = item.specName
        ? `${item.dishName}(${item.specName})`
        : item.dishName;
      const priceYuan = (item.price / 100).toFixed(2);
      lines.push(name);
      lines.push(padBoth(`  x${item.quantity}`, `￥${priceYuan}`));
    }

    lines.push(divider());

    // 合计
    const totalYuan = (order.totalAmount / 100).toFixed(2);
    lines.push(padBoth('合计', `￥${totalYuan}`));
    lines.push(divider('='));

    // 备注
    if (order.remark) {
      lines.push(`备注: ${order.remark}`);
    }

    // 底部
    lines.push('');
    lines.push(center('请扫描二维码查看订单详情'));
    lines.push(center('感谢您的惠顾'));
    lines.push('');

    // 走纸（留空行保证切纸位置）
    lines.push('');
    lines.push('');
    lines.push('');

    return lines.join('\n');
  }

  // ==================== 云打印机 API 对接 ====================

  /**
   * 根据品牌调用对应云打印 API
   * 开发环境下仅记录日志
   */
  private async sendToCloudPrinter(
    brand: string,
    deviceId: string,
    apiKey: string,
    content: string,
  ): Promise<void> {
    this.logger.log(
      `[Printer] 打印任务 — brand: ${brand}, deviceId: ${deviceId}\n${content}`,
    );

    // All brands: log content for manual printing until real API integration
    switch (brand) {
      case 'yilianyun':
        await this.sendYilianyun(deviceId, apiKey, content);
        break;
      case 'feie':
        this.sendFeie(deviceId, apiKey, content);
        break;
      case 'shangmi':
        this.sendShangmi(deviceId, apiKey, content);
        break;
      default:
        this.logger.warn(`[Printer] 不支持的打印机品牌: ${brand}，跳过打印`);
    }
  }

  /** 易联云云打印 API — 已对接 */
  private async sendYilianyun(
    deviceId: string,
    _apiKey: string,
    content: string,
  ): Promise<void> {
    if (!this.yilianyun.isConfigured()) {
      this.logger.warn('[Printer] 易联云未配置凭据，跳过打印');
      return;
    }

    const originId = `print_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await this.yilianyun.print(
      deviceId,
      this.buildYlContent(content),
      originId,
    );
  }

  /** 将通用打印内容转为易联云排版格式 */
  private buildYlContent(content: string): string {
    const lines = content.split('\n');
    const ylLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测分隔线: --- 或 ===
      if (/^[-=]{10,}$/.test(line)) {
        ylLines.push('--------------------------------');
        continue;
      }

      // 检测左右对齐格式: "左文本              右文本"
      const padMatch = line.match(/^(\S.*\S)\s{4,}(\S.*\S)$/);
      if (padMatch) {
        ylLines.push(`<LR>${padMatch[1]},${padMatch[2]}</LR>`);
        continue;
      }

      // 检测居中格式（左右有大量空格）
      if (trimmed && line.length > trimmed.length + 10) {
        ylLines.push(`<center>${trimmed}</center>`);
        continue;
      }

      // 普通行
      ylLines.push(line);
    }

    return ylLines.join('\n');
  }

  /** 飞鹅云打印 API — 待对接 real API */
  private sendFeie(_deviceId: string, _apiKey: string, _content: string): void {
    // TODO: 对接飞鹅 API
    // POST http://api.feieyun.cn/Api/Open/
    // 参数: user, stime, sig, apiname, sn, content
    this.logger.log('[Printer] 飞鹅 API 尚未对接，内容已通过日志输出');
  }

  /** 商米云打印 API — 待对接 real API */
  private sendShangmi(
    _deviceId: string,
    _apiKey: string,
    _content: string,
  ): void {
    // TODO: 对接商米 API
    this.logger.log('[Printer] 商米 API 尚未对接，内容已通过日志输出');
  }
}
