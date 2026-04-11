import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BuildConfig, Product, ProductCategory } from '../../entities';
import { SuggestBuildDto, SaveBuildDto } from './dto';

// Budget allocation ratios by purpose
const BUDGET_RATIOS: Record<string, Record<string, number>> = {
  gaming: {
    cpu: 0.20,
    gpu: 0.35,
    ram: 0.08,
    ssd: 0.08,
    mainboard: 0.12,
    psu: 0.08,
    case: 0.09,
  },
  workstation: {
    cpu: 0.30,
    gpu: 0.25,
    ram: 0.12,
    ssd: 0.10,
    mainboard: 0.10,
    psu: 0.06,
    case: 0.07,
  },
  office: {
    cpu: 0.25,
    gpu: 0.10,
    ram: 0.15,
    ssd: 0.15,
    mainboard: 0.15,
    psu: 0.10,
    case: 0.10,
  },
  streaming: {
    cpu: 0.25,
    gpu: 0.30,
    ram: 0.10,
    ssd: 0.10,
    mainboard: 0.10,
    psu: 0.08,
    case: 0.07,
  },
};

const CATEGORY_MAP: Record<string, ProductCategory> = {
  cpu: ProductCategory.CPU,
  gpu: ProductCategory.GPU,
  ram: ProductCategory.RAM,
  ssd: ProductCategory.SSD,
  mainboard: ProductCategory.MAINBOARD,
  psu: ProductCategory.PSU,
  case: ProductCategory.CASE,
};

@Injectable()
export class BuildService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(BuildConfig)
    private readonly buildRepo: Repository<BuildConfig>,
  ) {}

  async suggest(dto: SuggestBuildDto) {
    const purpose = dto.purpose || 'gaming';
    const ratios = BUDGET_RATIOS[purpose] || BUDGET_RATIOS.gaming;
    const suggested: Record<string, any> = {};
    let totalPrice = 0;

    for (const [key, ratio] of Object.entries(ratios)) {
      const categoryBudget = dto.budget * ratio;
      const category = CATEGORY_MAP[key];

      if (!category) continue;

      // Find best product within budget for this category
      const product = await this.productRepo
        .createQueryBuilder('p')
        .where('p.category = :category', { category })
        .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
        .orderBy('p.base_price', 'DESC') // Get the most expensive within budget
        .getOne();

      if (product) {
        suggested[key] = {
          product,
          budget_allocated: Math.round(categoryBudget),
        };
        totalPrice += Number(product.base_price);
      } else {
        // If nothing in budget, get cheapest
        const cheapest = await this.productRepo
          .createQueryBuilder('p')
          .where('p.category = :category', { category })
          .orderBy('p.base_price', 'ASC')
          .getOne();

        if (cheapest) {
          suggested[key] = {
            product: cheapest,
            budget_allocated: Math.round(categoryBudget),
            over_budget: true,
          };
          totalPrice += Number(cheapest.base_price);
        }
      }
    }

    return {
      purpose,
      budget: dto.budget,
      total_price: totalPrice,
      within_budget: totalPrice <= dto.budget,
      components: suggested,
    };
  }

  async saveBuild(userId: number, dto: SaveBuildDto) {
    const build = this.buildRepo.create({
      user_id: userId,
      name: dto.name,
      components: dto.components,
      total_price: dto.total_price,
    });
    return this.buildRepo.save(build);
  }

  async getUserBuilds(userId: number) {
    return this.buildRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async deleteBuild(userId: number, buildId: number) {
    const build = await this.buildRepo.findOne({
      where: { id: buildId, user_id: userId },
    });
    if (!build) {
      throw new NotFoundException('Cấu hình không tồn tại');
    }
    await this.buildRepo.remove(build);
    return { message: 'Đã xóa cấu hình' };
  }
}
