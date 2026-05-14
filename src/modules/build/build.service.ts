import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BuildConfig, Product, ProductCategory } from '../../entities';
import { SuggestBuildDto, SaveBuildDto, UpdateBuildDto } from './dto';

// Budget allocation ratios by purpose
const BUDGET_RATIOS: Record<string, Record<string, number>> = {
  gaming: {
    cpu: 0.20,
    gpu: 0.35,
    ram: 0.08,
    harddrive: 0.08,
    mainboard: 0.12,
    psu: 0.08,
    case: 0.09,
  },
  workstation: {
    cpu: 0.30,
    gpu: 0.25,
    ram: 0.12,
    harddrive: 0.10,
    mainboard: 0.10,
    psu: 0.06,
    case: 0.07,
  },
  office: {
    cpu: 0.25,
    gpu: 0.10,
    ram: 0.15,
    harddrive: 0.15,
    mainboard: 0.15,
    psu: 0.10,
    case: 0.10,
  },
  streaming: {
    cpu: 0.25,
    gpu: 0.30,
    ram: 0.10,
    harddrive: 0.10,
    mainboard: 0.10,
    psu: 0.08,
    case: 0.07,
  },
};

const CATEGORY_MAP: Record<string, ProductCategory> = {
  cpu: ProductCategory.CPU,
  gpu: ProductCategory.GPU,
  ram: ProductCategory.RAM,
  harddrive: ProductCategory.HARDDRIVE,
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
  ) { }

  async suggest(dto: SuggestBuildDto) {
    const purpose = dto.purpose || 'gaming';
    const ratios = BUDGET_RATIOS[purpose] || BUDGET_RATIOS.gaming;
    const suggested: Record<string, any> = {};
    const compatibilityWarnings: string[] = [];
    let totalPrice = 0;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    const addComponent = (key: string, product: any, budget: number) => {
      suggested[key] = {
        product,
        budget_allocated: Math.round(budget),
        over_budget: Number(product.base_price) > budget * 1.15,
      };
      totalPrice += Number(product.base_price);
    };

    const findBest = async (category: ProductCategory, categoryBudget: number) => {
      const withinBudget = await this.productRepo
        .createQueryBuilder('p')
        .where('p.category = :category', { category })
        .andWhere('p.base_price IS NOT NULL')
        .andWhere('p.base_price > 0')
        .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
        .orderBy('p.base_price', 'DESC')
        .getOne();

      if (withinBudget) return withinBudget;

      return this.productRepo
        .createQueryBuilder('p')
        .where('p.category = :category', { category })
        .andWhere('p.base_price IS NOT NULL')
        .andWhere('p.base_price > 0')
        .orderBy('p.base_price', 'ASC')
        .getOne();
    };

    // Hỗ trợ cả key PCPartPicker ("Socket / CPU") lẫn key chuẩn hoá ("socket_cpu")
    const findMainboard = async (categoryBudget: number, cpuSocket: string) => {
      const socketCond = `(p.specs->>'Socket / CPU' = :socket OR p.specs->>'socket_cpu' = :socket)`;
      const baseConditions = (qb: SelectQueryBuilder<Product>) =>
        qb
          .where('p.category = :category', { category: CATEGORY_MAP['mainboard'] })
          .andWhere(socketCond, { socket: cpuSocket })
          .andWhere('p.base_price IS NOT NULL')
          .andWhere('p.base_price > 0');

      const withinBudget = await baseConditions(
        this.productRepo.createQueryBuilder('p'),
      )
        .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
        .orderBy('p.base_price', 'DESC')
        .getOne();

      if (withinBudget) return withinBudget;

      return baseConditions(this.productRepo.createQueryBuilder('p'))
        .orderBy('p.base_price', 'ASC')
        .getOne();
    };

    // Hỗ trợ cả key PCPartPicker ("Speed") lẫn key chuẩn hoá ("speed")
    const findRam = async (categoryBudget: number, ddrGen: string) => {
      const speedCond = `(p.specs->>'Speed' ILIKE :pattern OR p.specs->>'speed' ILIKE :pattern)`;
      const baseConditions = (qb: SelectQueryBuilder<Product>) =>
        qb
          .where('p.category = :category', { category: CATEGORY_MAP['ram'] })
          .andWhere(speedCond, { pattern: `${ddrGen}%` })
          .andWhere('p.base_price IS NOT NULL')
          .andWhere('p.base_price > 0');

      const withinBudget = await baseConditions(
        this.productRepo.createQueryBuilder('p'),
      )
        .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
        .orderBy('p.base_price', 'DESC')
        .getOne();

      if (withinBudget) return withinBudget;

      return baseConditions(this.productRepo.createQueryBuilder('p'))
        .orderBy('p.base_price', 'ASC')
        .getOne();
    };

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 1: CPU — chọn trước để biết socket + iGPU cho các bước sau
    // ════════════════════════════════════════════════════════════════════════
    const cpuBudget = dto.budget * ((ratios['cpu'] as number) ?? 0);
    const cpuCategory = CATEGORY_MAP['cpu'];
    let cpuProduct: any = null;

    if (cpuCategory) {
      cpuProduct = await findBest(cpuCategory, cpuBudget);
      if (cpuProduct) addComponent('cpu', cpuProduct, cpuBudget);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 2: Xác định có cần GPU không
    // Bỏ GPU nếu: budget ratio thấp (< 0.15) VÀ CPU có đồ họa tích hợp
    // ════════════════════════════════════════════════════════════════════════
    const gpuRatio = (ratios['gpu'] as number) ?? 0;
    // PCPartPicker key = "Integrated Graphics"; fallback normalized key
    const cpuIGPU: string | null =
      cpuProduct?.specs?.['Integrated Graphics'] ??
      cpuProduct?.specs?.integrated_graphics ??
      null;
    const cpuHasIGPU = !!cpuIGPU && cpuIGPU.toLowerCase() !== 'none';
    const skipGpu = gpuRatio < 0.15 && cpuHasIGPU;

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 3: Các component không liên quan compatibility
    //         (bỏ GPU khỏi danh sách nếu skipGpu)
    // ════════════════════════════════════════════════════════════════════════
    const nonCompatibilityKeys = Object.keys(ratios).filter(
      (k) => !['cpu', 'mainboard', 'ram'].includes(k) && !(k === 'gpu' && skipGpu),
    );

    for (const key of nonCompatibilityKeys) {
      const category = CATEGORY_MAP[key];
      if (!category) continue;

      const categoryBudget = dto.budget * (ratios[key] as number);
      const product = await findBest(category, categoryBudget);
      if (product) addComponent(key, product, categoryBudget);
    }

    if (skipGpu) {
      compatibilityWarnings.push(
        `GPU đã được bỏ qua: CPU có đồ họa tích hợp (${cpuIGPU}) và mục đích '${purpose}' không yêu cầu card đồ họa rời.`,
      );
    }

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 4: Mainboard – phải khớp socket với CPU
    // PCPartPicker: CPU specs = "Socket", mainboard specs = "Socket / CPU"
    // ════════════════════════════════════════════════════════════════════════
    const mbBudget = dto.budget * ((ratios['mainboard'] as number) ?? 0);
    const mbCategory = CATEGORY_MAP['mainboard'];
    let mbProduct: any = null;

    if (mbCategory) {
      const cpuSocket: string | null =
        cpuProduct?.specs?.['Socket'] ??
        cpuProduct?.specs?.socket ??
        null;

      if (cpuSocket) {
        mbProduct = await findMainboard(mbBudget, cpuSocket);

        if (!mbProduct) {
          compatibilityWarnings.push(
            `Không tìm được mainboard có socket '${cpuSocket}'. Gợi ý mainboard tốt nhất theo budget.`,
          );
          mbProduct = await findBest(mbCategory, mbBudget);
        }
      } else {
        compatibilityWarnings.push(
          `CPU '${cpuProduct?.name ?? ''}' chưa có thông tin socket. Bỏ qua kiểm tra CPU–Mainboard.`,
        );
        mbProduct = await findBest(mbCategory, mbBudget);
      }

      if (mbProduct) addComponent('mainboard', mbProduct, mbBudget);
    }

    // ════════════════════════════════════════════════════════════════════════
    // BƯỚC 5: RAM – phải khớp DDR gen với mainboard memory_type
    // PCPartPicker: mainboard specs = "Memory Type"
    // ════════════════════════════════════════════════════════════════════════
    const ramBudget = dto.budget * ((ratios['ram'] as number) ?? 0);
    const ramCategory = CATEGORY_MAP['ram'];

    if (ramCategory) {
      const mbMemoryType: string | null =
        mbProduct?.specs?.['Memory Type'] ??
        mbProduct?.specs?.memory_type ??
        null;

      if (mbMemoryType) {
        const ramProduct = await findRam(ramBudget, mbMemoryType);

        if (!ramProduct) {
          compatibilityWarnings.push(
            `Không tìm được RAM ${mbMemoryType} tương thích. Gợi ý RAM tốt nhất theo budget.`,
          );
          const fallback = await findBest(ramCategory, ramBudget);
          if (fallback) addComponent('ram', fallback, ramBudget);
        } else {
          addComponent('ram', ramProduct, ramBudget);
        }
      } else {
        compatibilityWarnings.push(
          `Mainboard '${mbProduct?.name ?? ''}' chưa có thông tin loại RAM. Bỏ qua kiểm tra Mainboard–RAM.`,
        );
        const fallback = await findBest(ramCategory, ramBudget);
        if (fallback) addComponent('ram', fallback, ramBudget);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    return {
      purpose,
      budget: dto.budget,
      total_price: Math.round(totalPrice),
      within_budget: totalPrice <= dto.budget,
      compatibility_warnings: compatibilityWarnings,
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

  async updateBuild(userId: number, buildId: number, dto: UpdateBuildDto) {
    const build = await this.buildRepo.findOne({
      where: { id: buildId, user_id: userId },
    });
    if (!build) {
      throw new NotFoundException('Cấu hình không tồn tại');
    }

    if (dto.name !== undefined) build.name = dto.name;
    if (dto.components !== undefined) build.components = dto.components;
    if (dto.total_price !== undefined) build.total_price = dto.total_price;

    return this.buildRepo.save(build);
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
