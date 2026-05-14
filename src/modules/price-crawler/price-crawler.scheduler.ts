import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PriceCrawlerService } from './price-crawler.service';

@Injectable()
export class PriceCrawlerScheduler {
    private readonly logger = new Logger(PriceCrawlerScheduler.name);

    constructor(private readonly crawlerService: PriceCrawlerService) { }

    // Chạy lúc 2:00 AM mỗi ngày
    @Cron('0 2 * * *')
    async scheduledCrawl() {
        this.logger.log('⏰ Scheduled crawl started...');
        const results = await this.crawlerService.crawlAllProducts();
        const totalSaved = results.reduce((sum, r) => sum + r.saved_count, 0);
        this.logger.log(`✅ Scheduled crawl done. Saved ${totalSaved} prices for ${results.length} products.`);
    }
}
