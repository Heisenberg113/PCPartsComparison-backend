import {
    Controller,
    Post,
    Get,
    Param,
    ParseIntPipe,
    HttpCode,
    HttpStatus,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { PriceCrawlerService } from './price-crawler.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

@ApiTags('Crawler')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('crawler')
export class PriceCrawlerController {
    constructor(private readonly crawlerService: PriceCrawlerService) { }

    @Get('status')
    @ApiOperation({ summary: 'Trạng thái crawl hiện tại + log buffer' })
    getStatus() {
        return this.crawlerService.getCrawlStatus();
    }

    @Post('stop')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Dừng crawl đang chạy' })
    stop() {
        this.crawlerService.stopCrawl();
        return { message: 'Đã gửi yêu cầu dừng crawl.' };
    }

    @Get('products-without-prices')
    @ApiOperation({ summary: 'Danh sách sản phẩm chưa có giá nào' })
    getProductsWithoutPrices() {
        return this.crawlerService.getProductsWithoutPrices();
    }

    @Post('missing-prices')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Crawl chỉ những sản phẩm chưa có giá' })
    crawlMissing() {
        return this.crawlerService.crawlMissingPrices();
    }

    @Post('product/:id')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Crawl giá cho 1 product' })
    crawlOne(@Param('id', ParseIntPipe) id: number) {
        return this.crawlerService.crawlByProductId(id);
    }

    @Post('all')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Crawl toàn bộ products' })
    crawlAll() {
        return this.crawlerService.crawlAllProducts();
    }

    @Post('range')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Crawl theo khoảng ID' })
    crawlRange(
        @Query('from', new ParseIntPipe({ optional: true })) from?: number,
        @Query('to', new ParseIntPipe({ optional: true })) to?: number,
    ) {
        return this.crawlerService.crawlAllProducts(from, to);
    }
}
