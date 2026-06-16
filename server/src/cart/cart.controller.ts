import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('api/cart')
@UseGuards(AuthGuard('jwt'))
export class CartController {
  constructor(private cart: CartService) {}

  /** 获取购物车 */
  @Get()
  async getCart(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.cart.getCart(req.user.userId, tenantId);
  }

  /** 添加商品到购物车 */
  @Post('items')
  async addItem(
    @Req() req: any,
    @Headers('x-tenant-id') tenantId: string,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cart.addItem(req.user.userId, tenantId, dto);
  }

  /** 修改购物车项数量 */
  @Put('items/:id')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(req.user.userId, id, dto);
  }

  /** 删除购物车项 */
  @Delete('items/:id')
  async removeItem(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.cart.removeItem(req.user.userId, id);
  }

  /** 清空购物车 */
  @Delete()
  async clearCart(@Req() req: any) {
    return this.cart.clearCart(req.user.userId);
  }
}
