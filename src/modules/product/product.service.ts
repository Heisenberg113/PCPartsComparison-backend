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

    // Price range
    if (filter.min_price !== undefined) {
      qb.andWhere('p.base_price >= :minPrice', { minPrice: filter.min_price });
    }
    if (filter.max_price !== undefined) {
      qb.andWhere('p.base_price <= :maxPrice', { maxPrice: filter.max_price });
    }

    // Sorting
    const sortBy = filter.sort_by || 'created_at';
    const sortField = ['name', 'base_price', 'avg_rating', 'created_at'].includes(sortBy)
      ? `p.${sortBy}`
      : 'p.created_at';
    qb.orderBy(sortField, filter.sort_order === 'ASC' ? 'ASC' : 'DESC');

    // Pagination
    const page = filter.page || 1;
    const limit = Math.min(filter.limit || 20, 50);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

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
