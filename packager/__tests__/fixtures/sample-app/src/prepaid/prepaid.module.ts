import { Module } from '@nestjs/common';
import { PrepaidService } from './prepaid.service';
import { PrepaidController } from './prepaid.controller';

@Module({
  providers: [PrepaidService],
  controllers: [PrepaidController],
  exports: [PrepaidService],
})
export class PrepaidModule {}
