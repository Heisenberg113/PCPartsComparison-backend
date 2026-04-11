import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BuildController } from './build.controller';
import { BuildService } from './build.service';
import { BuildConfig, Product } from '../../entities';

@Module({
  imports: [TypeOrmModule.forFeature([BuildConfig, Product])],
  controllers: [BuildController],
  providers: [BuildService],
  exports: [BuildService],
})
export class BuildModule {}
