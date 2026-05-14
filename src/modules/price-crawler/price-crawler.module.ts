import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { PriceCrawlerService } from './price-crawler.service';
import { PriceCrawlerController } from './price-crawler.controller';
import { PriceCrawlerScheduler } from './price-crawler.scheduler';
import { Product } from '../../entities/product.entity';
import { Price } from '../../entities/price.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Product, Price]),
        ScheduleModule.forRoot(), // Bỏ nếu đã import ở AppModule
    ],
    controllers: [PriceCrawlerController],
    providers: [PriceCrawlerService, PriceCrawlerScheduler],
    exports: [PriceCrawlerService],
})
export class PriceCrawlerModule { }
