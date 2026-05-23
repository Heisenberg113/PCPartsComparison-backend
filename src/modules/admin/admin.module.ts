import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, Review, Product, Price } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([User, Review, Product, Price])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
