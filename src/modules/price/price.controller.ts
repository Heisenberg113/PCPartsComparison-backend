import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PriceService } from './price.service';

@ApiTags('Prices')
@Controller('products/:productId/prices')
export class PriceController {
  constructor(private readonly priceService: PriceService) {}

  @Get()
  @ApiOperation({ summary: 'Giá hiện tại từ các shop' })
  getCurrentPrices(@Param('productId', ParseIntPipe) productId: number) {
    return this.priceService.getCurrentPrices(productId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Lịch sử giá theo thời gian' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getPriceHistory(
    @Param('productId', ParseIntPipe) productId: number,
    @Query('days') days?: number,
  ) {
    return this.priceService.getPriceHistory(productId, days || 90);
  }

  @Get('lowest')
  @ApiOperation({ summary: 'Giá thấp nhất hiện tại' })
  getLowestPrice(@Param('productId', ParseIntPipe) productId: number) {
    return this.priceService.getLowestPrice(productId);
  }
}
