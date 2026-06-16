import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SkuService } from './sku.service';
import { SkuController } from './sku.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SkuController],
  providers: [SkuService],
  exports: [SkuService],
})
export class SkuModule {}
