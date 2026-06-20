import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { PrinterService } from './printer.service';
import { YilianyunService } from './yilianyun.service';
import { PrinterController } from './printer.controller';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [PrinterController],
  providers: [PrinterService, YilianyunService],
  exports: [PrinterService],
})
export class PrinterModule {}
