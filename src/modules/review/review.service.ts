import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review, Product } from '../../entities';
import { CreateReviewDto, UpdateReviewDto } from './dto';

@Injectable()
export class ReviewService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async create(userId: number, dto: CreateReviewDto) {
    // Check product exists
    const product = await this.productRepo.findOne({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException('Sản phẩm không tồn tại');
    }

    // Check if user already reviewed this product
    const existing = await this.reviewRepo.findOne({
      where: { product_id: dto.product_id, user_id: userId },
    });
    if (existing) {
      throw new ForbiddenException('Bạn đã đánh giá sản phẩm này rồi');
    }

    const review = this.reviewRepo.create({
      product_id: dto.product_id,
      user_id: userId,
      rating: dto.rating,
      content: dto.content,
    });
    await this.reviewRepo.save(review);

    // Update product average rating
    await this.updateProductRating(dto.product_id);

    return review;
  }

  async update(userId: number, reviewId: number, dto: UpdateReviewDto) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review không tồn tại');
    }
    if (review.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền sửa review này');
    }

    review.rating = dto.rating;
    review.content = dto.content;
    await this.reviewRepo.save(review);

    await this.updateProductRating(review.product_id);

    return review;
  }

  async delete(userId: number, reviewId: number) {
    const review = await this.reviewRepo.findOne({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Review không tồn tại');
    }
    if (review.user_id !== userId) {
      throw new ForbiddenException('Bạn không có quyền xóa review này');
    }

    const productId = review.product_id;
    await this.reviewRepo.remove(review);
    await this.updateProductRating(productId);

    return { message: 'Đã xóa review thành công' };
  }

  async findByProduct(productId: number, page: number = 1, limit: number = 10) {
    const [data, total] = await this.reviewRepo.findAndCount({
      where: { product_id: productId },
      relations: ['user'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Sanitize user data
    const sanitized = data.map((r) => ({
      id: r.id,
      rating: r.rating,
      content: r.content,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: r.user ? { id: r.user.id, username: r.user.username } : null,
    }));

    return {
      data: sanitized,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async findByUser(userId: number) {
    return this.reviewRepo.find({
      where: { user_id: userId },
      relations: ['product'],
      order: { created_at: 'DESC' },
    });
  }

  private async updateProductRating(productId: number) {
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
  }
}
