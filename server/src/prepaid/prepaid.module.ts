import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrepaidService } from './prepaid.service';
import { PrepaidController } from './prepaid.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PrepaidController],
  providers: [PrepaidService],
  exports: [PrepaidService],
})
export class PrepaidModule {}
