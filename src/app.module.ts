import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { getDatabaseConfig } from './config';

// Feature modules
import { AuthModule } from './modules/auth/auth.module';
import { ProductModule } from './modules/product/product.module';
import { PriceModule } from './modules/price/price.module';
import { ReviewModule } from './modules/review/review.module';
import { BuildModule } from './modules/build/build.module';
import { SearchModule } from './modules/search/search.module';
import { PriceCrawlerModule } from './modules/price-crawler/price-crawler.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,  // 60 seconds
      limit: 100,  // 100 requests per 60s
    }]),
    ScheduleModule.forRoot(),
    AuthModule,
    ProductModule,
    PriceModule,
    ReviewModule,
    BuildModule,
    SearchModule,
    PriceCrawlerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
