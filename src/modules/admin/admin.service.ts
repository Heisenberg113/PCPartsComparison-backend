import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Review, Product, Price } from '../../entities';
import { UserRole } from '../../entities/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Review) private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Price) private readonly priceRepo: Repository<Price>,
  ) {}

  async getStats() {
    const [totalProducts, totalUsers, totalReviews, totalPrices] = await Promise.all([
      this.productRepo.count(),
      this.userRepo.count(),
      this.reviewRepo.count(),
      this.priceRepo.count(),
    ]);

    const categoryStats = await this.productRepo
      .createQueryBuilder('p')
      .select('p.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.category')
      .orderBy('count', 'DESC')
      .getRawMany();

    const recentProducts = await this.productRepo.find({
      order: { created_at: 'DESC' },
      take: 5,
      select: ['id', 'name', 'category', 'brand', 'created_at'],
    });

    const recentReviews = await this.reviewRepo.find({
      order: { created_at: 'DESC' },
      take: 5,
      relations: ['user', 'product'],
    });

    return {
      totals: { products: totalProducts, users: totalUsers, reviews: totalReviews, prices: totalPrices },
      categoryStats,
      recentProducts,
      recentReviews: recentReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        content: r.content,
        created_at: r.created_at,
        user: r.user ? { id: r.user.id, username: r.user.username } : null,
        product: r.product ? { id: r.product.id, name: r.product.name } : null,
      })),
    };
  }

  async getUsers(page = 1, limit = 20, search?: string) {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.email', 'u.username', 'u.role', 'u.created_at']);

    if (search) {
      qb.where('LOWER(u.email) LIKE LOWER(:s) OR LOWER(u.username) LIKE LOWER(:s)', {
        s: `%${search}%`,
      });
    }

    const total = await qb.getCount();
    const data = await qb
      .orderBy('u.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async setUserRole(userId: number, role: UserRole) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    user.role = role;
    return this.userRepo.save(user);
  }

  async deleteUser(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    await this.userRepo.remove(user);
    return { message: 'Đã xóa người dùng thành công' };
  }

  async getReviews(page = 1, limit = 20, productId?: number) {
    const qb = this.reviewRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'u')
      .leftJoinAndSelect('r.product', 'p')
      .select([
        'r.id', 'r.rating', 'r.content', 'r.created_at',
        'u.id', 'u.username',
        'p.id', 'p.name',
      ]);

    if (productId) {
      qb.where('r.product_id = :productId', { productId });
    }

    qb.orderBy('r.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async deleteReview(reviewId: number) {
    const review = await this.reviewRepo.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review không tồn tại');
    const productId = review.product_id;
    await this.reviewRepo.remove(review);

    const result = await this.reviewRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r.product_id = :productId', { productId })
      .getRawOne();

    await this.productRepo.update(productId, {
      avg_rating: parseFloat(result.avg) || 0,
      review_count: parseInt(result.count) || 0,
    });

    return { message: 'Đã xóa review thành công' };
  }
}
