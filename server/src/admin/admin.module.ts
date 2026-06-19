import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PackagerService } from './packager.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, PackagerService],
})
export class AdminModule {}
