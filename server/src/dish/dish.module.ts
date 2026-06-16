import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DishService } from './dish.service';
import { DishController } from './dish.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DishController],
  providers: [DishService],
  exports: [DishService],
})
export class DishModule {}
