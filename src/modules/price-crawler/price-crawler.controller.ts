import {
    Controller,
    Post,
    Param,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
    Query,
} from '@nestjs/common';
import { PriceCrawlerService } from './price-crawler.service';

@Controller('crawler')
export class PriceCrawlerController {
    constructor(private readonly crawlerService: PriceCrawlerService) { }

    /**
     * POST /crawler/product/:id
     * Crawl giá cho 1 product cụ thể
     */
    @Post('product/:id')
    @HttpCode(HttpStatus.OK)
    crawlOne(@Param('id', ParseIntPipe) id: number) {
        return this.crawlerService.crawlByProductId(id);
    }

    /**
     * POST /crawler/all
     * Crawl toàn bộ products (dùng cho cron / admin trigger)
     */
    @Post('all')
    @HttpCode(HttpStatus.OK)
    crawlAll() {
        return this.crawlerService.crawlAllProducts();
    }

    /**
     * POST /crawler/range?from=100&to=200
     * Crawl products trong khoảng ID (cả hai tham số đều tuỳ chọn)
     */
    @Post('range')
    @HttpCode(HttpStatus.OK)
    crawlRange(
        @Query('from', new ParseIntPipe({ optional: true })) from?: number,
        @Query('to', new ParseIntPipe({ optional: true })) to?: number,
    ) {
        return this.crawlerService.crawlAllProducts(from, to);
    }
}
