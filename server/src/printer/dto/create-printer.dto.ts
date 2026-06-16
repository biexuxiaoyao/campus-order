import { IsString, IsIn } from 'class-validator';

const PRINTER_BRANDS = ['yilianyun', 'feie', 'shangmi'] as const;
export type PrinterBrand = (typeof PRINTER_BRANDS)[number];

export class CreatePrinterDto {
  @IsString()
  @IsIn(PRINTER_BRANDS, {
    message: `品牌必须是 ${PRINTER_BRANDS.join('、')} 之一`,
  })
  brand: string;

  @IsString()
  deviceId: string;

  @IsString()
  apiKey: string;
}
