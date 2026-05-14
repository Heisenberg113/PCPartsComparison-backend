import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, SelectQueryBuilder } from 'typeorm';
import { Product, ProductCategory } from '../../entities';
import { FilterProductDto } from './dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async findAll(filter: FilterProductDto) {
    const qb = this.productRepo.createQueryBuilder('p');

    // Category filter
    if (filter.category) {
      qb.andWhere('p.category = :category', { category: filter.category });
    }

    // Brand filter
    if (filter.brand) {
      qb.andWhere('LOWER(p.brand) = LOWER(:brand)', { brand: filter.brand });
    }

    // Search by name
    if (filter.search) {
      qb.andWhere('LOWER(p.name) LIKE LOWER(:search)', {
        search: `%${filter.search}%`,
      });
    }

    // Price range — dùng prices table vì base_price có thể = 0 (chưa crawl)
    if (filter.min_price !== undefined || filter.max_price !== undefined) {
      const conditions = ['pr.product_id = p.id'];
      const priceParams: Record<string, number> = {};
      if (filter.min_price !== undefined) {
        conditions.push('pr.price >= :minPrice');
        priceParams.minPrice = filter.min_price;
      }
      if (filter.max_price !== undefined) {
        conditions.push('pr.price <= :maxPrice');
        priceParams.maxPrice = filter.max_price;
      }
      qb.andWhere(
        `EXISTS (SELECT 1 FROM prices pr WHERE ${conditions.join(' AND ')})`,
        priceParams,
      );
    }

    // Spec filters (JSONB) — {"Socket":"AM5"} hoặc {"TDP":{"min":50,"max":125}}
    if (filter.specs_filter) {
      try {
        const specsObj = JSON.parse(filter.specs_filter) as Record<string, unknown>;
        let idx = 0;
        for (const [rawKey, value] of Object.entries(specsObj)) {
          const escapedKey = rawKey.replace(/'/g, "''");
          const jsonPath = `p.specs->>'${escapedKey}'`;
          if (typeof value === 'string') {
            const vp = `spv${idx}`;
            qb.andWhere(`${jsonPath} = :${vp}`, { [vp]: value });
          } else if (value !== null && typeof value === 'object') {
            const range = value as { min?: number; max?: number };
            // NULLIF(..., '') handles empty extract → NULL instead of cast error
            const numExpr = `NULLIF(regexp_replace(COALESCE(${jsonPath}, ''), '[^0-9.]', '', 'g'), '')::numeric`;
            if (range.min !== undefined) {
              const mp = `spm${idx}`;
              qb.andWhere(`${numExpr} >= :${mp}`, { [mp]: range.min });
            }
            if (range.max !== undefined) {
              const xp = `spx${idx}`;
              qb.andWhere(`${numExpr} <= :${xp}`, { [xp]: range.max });
            }
          }
          idx++;
        }
      } catch {
        // JSON không hợp lệ, bỏ qua
      }
    }

    // Sorting
    const sortBy = filter.sort_by || 'created_at';
    const sortDir = filter.sort_order === 'ASC' ? 'ASC' : 'DESC';
    if (sortBy === 'base_price') {
      // Sắp xếp theo giá thực từ prices table, sản phẩm chưa có giá xuống cuối
      qb.orderBy(
        `(SELECT MIN(pr.price) FROM prices pr WHERE pr.product_id = p.id)`,
        sortDir,
        'NULLS LAST',
      );
    } else {
      const sortField = ['name', 'avg_rating', 'created_at'].includes(sortBy)
        ? `p.${sortBy}`
        : 'p.created_at';
      qb.orderBy(sortField, sortDir);
    }

    // Pagination
    const page = filter.page || 1;
    const limit = Math.min(filter.limit || 20, 50);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Đính kèm min_price từ bảng prices (1 query batch, không phải N+1)
    if (data.length > 0) {
      const ids = data.map(p => p.id);
      const rows: { product_id: number; min_price: string }[] =
        await this.productRepo.manager.query(
          `SELECT product_id, MIN(price)::int AS min_price
           FROM prices WHERE product_id = ANY($1)
           GROUP BY product_id`,
          [ids],
        );
      const priceMap = new Map(rows.map(r => [r.product_id, Number(r.min_price)]));
      return {
        data: data.map(p => ({ ...p, min_price: priceMap.get(p.id) ?? null })),
        meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
      };
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const product = await this.productRepo.findOne({
      where: { id },
      relations: ['prices', 'reviews'],
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm với id ${id}`);
    }
    return product;
  }

  async findBySlug(slug: string) {
    const product = await this.productRepo.findOne({
      where: { slug },
      relations: ['reviews'],
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm`);
    }
    return product;
  }

  async compare(ids: number[]) {
    if (ids.length < 2 || ids.length > 4) {
      throw new NotFoundException('Cần 2-4 sản phẩm để so sánh');
    }
    const products = await this.productRepo.find({
      where: { id: In(ids) },
    });
    if (products.length !== ids.length) {
      throw new NotFoundException('Một số sản phẩm không tồn tại');
    }
    return products;
  }

  async getBrands(category?: ProductCategory) {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.brand', 'brand')
      .orderBy('p.brand', 'ASC');

    if (category) {
      qb.where('p.category = :category', { category });
    }

    return qb.getRawMany();
  }

  async getCategories() {
    const result = await this.productRepo
      .createQueryBuilder('p')
      .select('p.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.category')
      .orderBy('count', 'DESC')
      .getRawMany();

    return result;
  }
}
