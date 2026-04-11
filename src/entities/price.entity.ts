import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('prices')
@Index(['product_id', 'crawled_at'])
export class Price {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  product_id: number;

  @Column({ length: 100 })
  shop_name: string;

  @Column({ type: 'decimal', precision: 12, scale: 0 })
  price: number;

  @Column({ length: 1000, nullable: true })
  url: string;

  @Column({ type: 'boolean', default: true })
  in_stock: boolean;

  @CreateDateColumn()
  crawled_at: Date;

  @ManyToOne(() => Product, (product) => product.prices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
