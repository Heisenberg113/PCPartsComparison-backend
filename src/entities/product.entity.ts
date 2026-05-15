import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Price } from './price.entity';
import { Review } from './review.entity';
import { vector } from 'pgvector/drizzle-orm';

export enum ProductCategory {
  CPU = 'cpu',
  GPU = 'gpu',
  RAM = 'ram',
  HARDDRIVE = 'harddrive',  
  MAINBOARD = 'mainboard',
  PSU = 'psu',
  CASE = 'case',
  COOLER = 'cooler',
  MONITOR = 'monitor',
}

@Entity('products')
@Index(['category', 'brand'])
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 500 })
  name: string;

  @Column({ unique: true, length: 500 })
  slug: string;

  @Column({ type: 'enum', enum: ProductCategory })
  @Index()
  category: ProductCategory;

  @Column({ length: 100 })
  @Index()
  brand: string;

  @Column({ type: 'jsonb', default: {} })
  specs: Record<string, any>;

  @Column({ nullable: true, length: 1000 })
  image_url: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 12, scale: 0, nullable: true })
  base_price: number;

  @Column({ type: 'float', default: 0 })
  avg_rating: number;

  @Column({ type: 'int', default: 0 })
  review_count: number;

  // Rating từ cộng đồng PCPartPicker (tách biệt với review nội bộ)
  @Column({ type: 'decimal', precision: 3, scale: 1, nullable: true })
  ext_rating: number | null;

  @Column({ type: 'int', nullable: true })
  ext_review_count: number | null;

  @Column({
  type: 'vector', 
  length: 1024,
  nullable: true 
  })
  embedding: number[] | string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Price, (price) => price.product)
  prices: Price[];

  @OneToMany(() => Review, (review) => review.product)
  reviews: Review[];
}
