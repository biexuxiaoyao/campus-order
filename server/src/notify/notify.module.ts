import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { NotifyService } from './notify.service';

@Module({
  imports: [
    PrismaModule,
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
