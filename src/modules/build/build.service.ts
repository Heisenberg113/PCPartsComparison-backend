import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  // 'DDR4-3200' → 'DDR4'
  const extractDdrGen = (speed: string | null | undefined): string | null => {
    if (!speed) return null;
    const match = speed.match(/^(DDR\d+)/i);
    return match ? match[1].toUpperCase() : null;
  };

  const addComponent = (key: string, product: any, budget: number) => {
    suggested[key] = {
      product,
      budget_allocated: Math.round(budget),
      over_budget: Number(product.base_price) > budget,
    };
    totalPrice += Number(product.base_price);
  };

  // ─── Generic: best within budget, fallback to cheapest ───────────────────
  const findBest = async (category: string, categoryBudget: number) => {
    const withinBudget = await this.productRepo
      .createQueryBuilder('p')
      .where('p.category = :category', { category })
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

  // ─── Mainboard: filter by CPU socket ─────────────────────────────────────
  // CPU specs.socket = 'AM4'  ←→  Mainboard specs.socket_cpu = 'AM4'
  const findMainboard = async (categoryBudget: number, cpuSocket: string) => {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.category = :category', { category: CATEGORY_MAP['mainboard'] })
      .andWhere(`p.specs->>'socket_cpu' = :socket`, { socket: cpuSocket });

    const withinBudget = await qb
      .clone()
      .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
      .orderBy('p.base_price', 'DESC')
      .getOne();

    if (withinBudget) return withinBudget;

    // Cheapest compatible (bất kể giá)
    return qb
      .clone()
      .andWhere('p.base_price IS NOT NULL')
      .andWhere('p.base_price > 0')
      .orderBy('p.base_price', 'ASC')
      .getOne();
  };

  // ─── RAM: filter by mainboard memory_type ────────────────────────────────
  // Mainboard specs.memory_type = 'DDR4'  ←→  RAM specs.speed LIKE 'DDR4%'
  const findRam = async (categoryBudget: number, ddrGen: string) => {
    const qb = this.productRepo
      .createQueryBuilder('p')
      .where('p.category = :category', { category: CATEGORY_MAP['ram'] })
      .andWhere(`p.specs->>'speed' ILIKE :pattern`, {
        pattern: `${ddrGen}%`,
      });

    const withinBudget = await qb
      .clone()
      .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
      .orderBy('p.base_price', 'DESC')
      .getOne();

    if (withinBudget) return withinBudget;

    return qb
      .clone()
      .andWhere('p.base_price IS NOT NULL')
      .andWhere('p.base_price > 0')
      .orderBy('p.base_price', 'ASC')
      .getOne();
  };

  // ════════════════════════════════════════════════════════════════════════
  // BƯỚC 1: Pick tất cả component không liên quan compatibility
  // ════════════════════════════════════════════════════════════════════════
  const nonCompatibilityKeys = Object.keys(ratios).filter(
    (k) => !['cpu', 'mainboard', 'ram'].includes(k),
  );

  for (const key of nonCompatibilityKeys) {
    const category = CATEGORY_MAP[key];
    if (!category) continue;

    const categoryBudget = dto.budget * (ratios[key] as number);
    const product = await findBest(category, categoryBudget);
    if (product) addComponent(key, product, categoryBudget);
  }

  // ════════════════════════════════════════════════════════════════════════
  // BƯỚC 2: CPU (tự do, không ràng buộc)
  // ════════════════════════════════════════════════════════════════════════
  const cpuBudget = dto.budget * ((ratios['cpu'] as number) ?? 0);
  const cpuCategory = CATEGORY_MAP['cpu'];
  let cpuProduct: any = null;

  if (cpuCategory) {
    cpuProduct = await findBest(cpuCategory, cpuBudget);
    if (cpuProduct) addComponent('cpu', cpuProduct, cpuBudget);
  }

  // ════════════════════════════════════════════════════════════════════════
  // BƯỚC 3: Mainboard – phải khớp socket với CPU
  // ════════════════════════════════════════════════════════════════════════
  const mbBudget = dto.budget * ((ratios['mainboard'] as number) ?? 0);
  const mbCategory = CATEGORY_MAP['mainboard'];
  let mbProduct: any = null;

  if (mbCategory) {
    const cpuSocket: string | null = cpuProduct?.specs?.socket ?? null;

    if (cpuSocket) {
      mbProduct = await findMainboard(mbBudget, cpuSocket);

      if (!mbProduct) {
        compatibilityWarnings.push(
          `Không tìm được mainboard có socket_cpu = '${cpuSocket}'. Gợi ý mainboard tốt nhất theo budget.`,
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
  // BƯỚC 4: RAM – phải khớp DDR gen với mainboard memory_type
  // ════════════════════════════════════════════════════════════════════════
  const ramBudget = dto.budget * ((ratios['ram'] as number) ?? 0);
  const ramCategory = CATEGORY_MAP['ram'];

  if (ramCategory) {
    // Mainboard specs.memory_type = 'DDR4' → dùng trực tiếp, không cần extract
    const mbMemoryType: string | null = mbProduct?.specs?.memory_type ?? null;

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
        `Mainboard '${mbProduct?.name ?? ''}' chưa có thông tin memory_type. Bỏ qua kiểm tra Mainboard–RAM.`,
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
    compatibility_warnings: compatibilityWarnings,   // [] nếu không có vấn đề
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
