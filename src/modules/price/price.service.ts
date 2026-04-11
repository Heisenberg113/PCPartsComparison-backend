import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Price } from '../../entities';

@Injectable()
export class PriceService {
  constructor(
    @InjectRepository(Price)
    private readonly priceRepo: Repository<Price>,
  ) {}

  async getPriceHistory(productId: number, days: number = 90) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const prices = await this.priceRepo
      .createQueryBuilder('p')
      .where('p.product_id = :productId', { productId })
      .andWhere('p.crawled_at >= :sinceDate', { sinceDate })
      .orderBy('p.crawled_at', 'ASC')
      .getMany();

    // Group by shop
    const byShop: Record<string, { date: string; price: number }[]> = {};
    for (const price of prices) {
      if (!byShop[price.shop_name]) {
        byShop[price.shop_name] = [];
      }
      byShop[price.shop_name].push({
        date: price.crawled_at.toISOString().split('T')[0],
        price: Number(price.price),
      });
    }

    return {
      product_id: productId,
      history: byShop,
    };
  }

  async getCurrentPrices(productId: number) {
    // Get the latest price from each shop
    const prices = await this.priceRepo
      .createQueryBuilder('p')
      .where('p.product_id = :productId', { productId })
      .andWhere(
        'p.crawled_at = (SELECT MAX(p2.crawled_at) FROM prices p2 WHERE p2.product_id = p.product_id AND p2.shop_name = p.shop_name)',
      )
      .orderBy('p.price', 'ASC')
      .getMany();

    return prices.map((p) => ({
      shop_name: p.shop_name,
      price: Number(p.price),
      url: p.url,
      in_stock: p.in_stock,
      updated_at: p.crawled_at,
    }));
  }

  async getLowestPrice(productId: number) {
    const currentPrices = await this.getCurrentPrices(productId);
    if (currentPrices.length === 0) return null;
    return currentPrices[0]; // Already sorted by price ASC
  }
}
