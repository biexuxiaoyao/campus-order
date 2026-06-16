import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { DishService } from './dish.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import { QueryDishDto } from './dto/query-dish.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller()
export class DishController {
  constructor(private dish: DishService) {}

  // ========== 商家端 ==========

  @Get('api/merchant/stores/:storeId/dishes')
  async list(
    @Param('storeId') storeId: string,
    @Query() query: QueryDishDto,
  ) {
    return this.dish.findAll(storeId, query);
  }

  @Get('api/merchant/dishes/:id')
  async detail(@Param('id') id: string) {
    return this.dish.findOne(id);
  }

  @Post('api/merchant/stores/:storeId/dishes')
  async create(
    @Param('storeId') storeId: string,
    @Body() dto: CreateDishDto,
  ) {
    return this.dish.create(storeId, dto);
  }

  @Put('api/merchant/dishes/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDishDto,
  ) {
    return this.dish.update(id, dto);
  }

  @Delete('api/merchant/dishes/:id')
  async remove(@Param('id') id: string) {
    return this.dish.remove(id);
  }

  @Put('api/merchant/dishes/:id/publish')
  async publish(@Param('id') id: string) {
    return this.dish.publish(id);
  }

  @Put('api/merchant/dishes/:id/unpublish')
  async unpublish(@Param('id') id: string) {
    return this.dish.unpublish(id);
  }

  @Post('api/merchant/dishes/batch-status')
  async batchUpdateStatus(@Body() body: { ids: string[]; status: string }) {
    return this.dish.batchUpdateStatus(body.ids, body.status);
  }

  @Put('api/merchant/dishes/:id/estimated')
  async setEstimated(
    @Param('id') id: string,
    @Body() body: { estimated: boolean },
  ) {
    return this.dish.setEstimated(id, body.estimated);
  }

  @Post('api/merchant/dishes/:id/images')
  async addImage(
    @Param('id') id: string,
    @Body() body: { url: string; sortOrder?: number },
  ) {
    return this.dish.addImage(id, body.url, body.sortOrder);
  }

  @Delete('api/merchant/dishes/:id/images/:imageId')
  async removeImage(
    @Param('id') dishId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.dish.removeImage(imageId);
  }

  @Post('api/merchant/dishes/:id/related')
  async addRelated(
    @Param('id') id: string,
    @Body() body: { relatedId: string },
  ) {
    return this.dish.addRelated(id, body.relatedId);
  }

  @Delete('api/merchant/dishes/:id/related/:relatedId')
  async removeRelated(
    @Param('id') dishId: string,
    @Param('relatedId') relatedId: string,
  ) {
    return this.dish.removeRelated(relatedId);
  }

  // ========== C端（公开接口） ==========

  @Public()
  @Get('api/dishes')
  async publicList(@Query() query: QueryDishDto & { storeId: string }) {
    return this.dish.findPublished(query.storeId, query);
  }

  @Public()
  @Get('api/dishes/:id')
  async publicDetail(@Param('id') id: string) {
    return this.dish.findOne(id);
  }
}
