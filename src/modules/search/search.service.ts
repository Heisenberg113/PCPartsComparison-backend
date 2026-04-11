import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async search(query: string, limit: number = 20) {
    if (!query || query.trim().length < 2) {
      return { data: [], total: 0 };
    }

    const searchTerm = query.trim();

    // Use ILIKE for simple but effective search
    // Can be upgraded to tsvector for better performance at scale
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where(
        `(LOWER(p.name) LIKE LOWER(:term) OR LOWER(p.brand) LIKE LOWER(:term) OR LOWER(p.description) LIKE LOWER(:term))`,
        { term: `%${searchTerm}%` },
      )
      .orderBy(
        `CASE WHEN LOWER(p.name) LIKE LOWER(:exactTerm) THEN 0 ELSE 1 END`,
        'ASC',
      )
      .addOrderBy('p.avg_rating', 'DESC')
      .setParameter('exactTerm', `%${searchTerm}%`)
      .take(Math.min(limit, 50));

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      query: searchTerm,
    };
  }

  async autocomplete(query: string) {
    if (!query || query.trim().length < 2) {
      return [];
    }

    const results = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.name', 'p.slug', 'p.category', 'p.brand', 'p.base_price', 'p.image_url'])
      .where('LOWER(p.name) LIKE LOWER(:term)', {
        term: `%${query.trim()}%`,
      })
      .orderBy('p.avg_rating', 'DESC')
      .take(8)
      .getMany();

    return results;
  }
}
