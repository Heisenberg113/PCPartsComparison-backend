import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { BuildConfig, Product, ProductCategory } from '../../entities';
import { SuggestBuildDto, SaveBuildDto, UpdateBuildDto } from './dto';

// ─── Budget allocation presets ───────────────────────────────────────────────

const BUDGET_RATIOS: Record<string, Record<string, number>> = {
  gaming:      { cpu: 0.20, gpu: 0.35, ram: 0.08, harddrive: 0.08, mainboard: 0.12, psu: 0.08, case: 0.09 },
  workstation: { cpu: 0.30, gpu: 0.25, ram: 0.12, harddrive: 0.10, mainboard: 0.10, psu: 0.06, case: 0.07 },
  office:      { cpu: 0.25, gpu: 0.10, ram: 0.15, harddrive: 0.15, mainboard: 0.15, psu: 0.10, case: 0.10 },
  streaming:   { cpu: 0.25, gpu: 0.30, ram: 0.10, harddrive: 0.10, mainboard: 0.10, psu: 0.08, case: 0.07 },
};

const BUDGET_RATIOS_ALT: Record<string, Array<{ ratios: Record<string, number>; label: string; description: string }>> = {
  gaming: [
    { ratios: { cpu: 0.25, gpu: 0.30, ram: 0.10, harddrive: 0.07, mainboard: 0.12, psu: 0.08, case: 0.08 },
      label: 'Cân bằng CPU–GPU', description: 'Tăng ngân sách CPU, giảm nhẹ GPU — tốt cho game + đa nhiệm' },
    { ratios: { cpu: 0.18, gpu: 0.40, ram: 0.07, harddrive: 0.07, mainboard: 0.12, psu: 0.09, case: 0.07 },
      label: 'Ưu tiên GPU tối đa', description: 'GPU chiếm 40% ngân sách — tối ưu FPS cho game AAA' },
  ],
  workstation: [
    { ratios: { cpu: 0.35, gpu: 0.20, ram: 0.15, harddrive: 0.10, mainboard: 0.08, psu: 0.06, case: 0.06 },
      label: 'Ưu tiên CPU & RAM', description: 'CPU mạnh + RAM nhiều cho render, compile, ảo hóa' },
    { ratios: { cpu: 0.28, gpu: 0.28, ram: 0.14, harddrive: 0.10, mainboard: 0.10, psu: 0.06, case: 0.04 },
      label: 'Đa dụng Render+Game', description: 'CPU và GPU cân bằng — vừa làm việc vừa giải trí' },
  ],
  office: [
    { ratios: { cpu: 0.30, gpu: 0.05, ram: 0.20, harddrive: 0.15, mainboard: 0.13, psu: 0.10, case: 0.07 },
      label: 'Ưu tiên CPU + RAM', description: 'CPU + RAM mạnh, không cần GPU rời, phù hợp văn phòng nặng' },
    { ratios: { cpu: 0.20, gpu: 0.08, ram: 0.15, harddrive: 0.22, mainboard: 0.17, psu: 0.10, case: 0.08 },
      label: 'Ưu tiên lưu trữ', description: 'Nhiều dung lượng ổ cứng, phù hợp lưu trữ dữ liệu lớn' },
  ],
  streaming: [
    { ratios: { cpu: 0.30, gpu: 0.25, ram: 0.12, harddrive: 0.10, mainboard: 0.10, psu: 0.07, case: 0.06 },
      label: 'Ưu tiên CPU encode', description: 'CPU mạnh cho encode stream phần mềm, GPU vừa đủ cho game' },
    { ratios: { cpu: 0.22, gpu: 0.35, ram: 0.08, harddrive: 0.10, mainboard: 0.12, psu: 0.07, case: 0.06 },
      label: 'Ưu tiên GPU stream', description: 'GPU mạnh dùng NVENC/AMF encode — giảm tải CPU' },
  ],
};

export const RATIO_EXPLANATIONS: Record<string, { label: string; description: string; components: Record<string, string> }> = {
  gaming: {
    label: '🎮 Gaming',
    description: 'GPU là trái tim của dàn gaming — chiếm phần lớn ngân sách để đảm bảo FPS cao. CPU đủ mạnh để không bottleneck GPU.',
    components: {
      gpu:        'GPU (35%) — Thành phần quan trọng nhất, ảnh hưởng trực tiếp đến FPS',
      cpu:        'CPU (20%) — Cần đủ mạnh để không bottleneck GPU',
      mainboard:  'Mainboard (12%) — Bo mạch chủ ổn định, hỗ trợ OC nếu cần',
      case:       'Case (9%) — Vỏ máy đảm bảo tản nhiệt, airflow tốt',
      psu:        'PSU (8%) — Nguồn đủ công suất cho GPU cao cấp',
      harddrive:  'HDD/SSD (8%) — Ưu tiên SSD NVMe cho load game nhanh',
      ram:        'RAM (8%) — 16–32GB DDR5 là đủ cho gaming hiện tại',
    },
  },
  workstation: {
    label: '💼 Workstation',
    description: 'CPU và RAM là ưu tiên hàng đầu cho công việc render, compile, ảo hóa. GPU cũng cần thiết cho GPU-accelerated tasks.',
    components: {
      cpu:        'CPU (30%) — Nhiều nhân/luồng cho render, compile, VM',
      gpu:        'GPU (25%) — Hỗ trợ CUDA/OpenCL cho render GPU',
      ram:        'RAM (12%) — Cần nhiều RAM cho multi-tasking, VM',
      harddrive:  'HDD/SSD (10%) — SSD nhanh cho project files',
      mainboard:  'Mainboard (10%) — Nhiều khe RAM, PCIe cho mở rộng',
      psu:        'PSU (6%) — Nguồn ổn định cho uptime 24/7',
      case:       'Case (7%) — Tản nhiệt tốt cho tải nặng liên tục',
    },
  },
  office: {
    label: '🏢 Văn phòng',
    description: 'Cân bằng tất cả thành phần, ưu tiên độ bền và đủ dùng. GPU thấp vì chủ yếu dùng iGPU của CPU.',
    components: {
      cpu:        'CPU (25%) — Đủ mạnh cho office, web, light media',
      mainboard:  'Mainboard (15%) — Bo mạch ổn định, nhiều cổng IO',
      ram:        'RAM (15%) — 16GB thoải mái cho đa nhiệm văn phòng',
      harddrive:  'HDD/SSD (15%) — Lưu trữ đủ cho tài liệu, dữ liệu',
      psu:        'PSU (10%) — Nguồn đủ dùng, tiết kiệm điện',
      case:       'Case (10%) — Vỏ nhỏ gọn, yên tĩnh',
      gpu:        'GPU (10%) — Dùng iGPU CPU; GPU rời chỉ khi có nhu cầu',
    },
  },
  streaming: {
    label: '📺 Streaming',
    description: 'Cần cả CPU mạnh (encode stream) lẫn GPU tốt (render game). RAM nhiều để chạy game + OBS + tools đồng thời.',
    components: {
      gpu:        'GPU (30%) — Cần GPU đủ mạnh để render game 1080p/1440p',
      cpu:        'CPU (25%) — CPU nhiều nhân cho encode stream phần mềm',
      mainboard:  'Mainboard (10%) — Ổn định cho tải liên tục khi stream',
      harddrive:  'HDD/SSD (10%) — Lưu stream recordings, highlight',
      ram:        'RAM (10%) — 32GB cho game + OBS + tools stream',
      psu:        'PSU (8%) — Nguồn đủ cho GPU + CPU tải cao liên tục',
      case:       'Case (7%) — Airflow tốt tránh nhiệt khi stream giờ dài',
    },
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
  cooler: ProductCategory.COOLER,
};

// ─── Compatibility helpers ───────────────────────────────────────────────────

function parseRamModules(modules: string): { count: number; totalGB: number } | null {
  const m = (modules || '').match(/^(\d+)\s*x\s*(\d+)\s*GB/i);
  if (!m) return null;
  return { count: parseInt(m[1], 10), totalGB: parseInt(m[1], 10) * parseInt(m[2], 10) };
}

function parseGB(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  const m = (s || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function parseM2Size(formFactor: string): string | null {
  const m = (formFactor || '').match(/M\.2-?(\d+)/i);
  return m ? m[1] : null;
}

function m2SizeCompatible(size: string, slots: string[]): boolean {
  return slots.some((slot) => slot.replace(/[^0-9/]/g, '').split('/').includes(size));
}

function parseSataCount(sata: string | number | null | undefined): number {
  if (typeof sata === 'number') return sata;
  const m = (sata || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BuildService {
  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(BuildConfig) private readonly buildRepo: Repository<BuildConfig>,
  ) {}

  getBudgetRatios() {
    return {
      presets: BUDGET_RATIOS,
      alternatives: BUDGET_RATIOS_ALT,
      explanations: RATIO_EXPLANATIONS,
    };
  }

  async suggest(dto: SuggestBuildDto) {
    const purpose = dto.purpose || 'gaming';
    const mainRatios = dto.custom_ratios ?? BUDGET_RATIOS[purpose] ?? BUDGET_RATIOS.gaming;
    const alts = BUDGET_RATIOS_ALT[purpose] ?? BUDGET_RATIOS_ALT.gaming;

    const [main, alt1, alt2] = await Promise.all([
      this.buildFromRatios(dto.budget, purpose, mainRatios, 'Cấu hình chính'),
      this.buildFromRatios(dto.budget, purpose, alts[0].ratios, alts[0].label),
      this.buildFromRatios(dto.budget, purpose, alts[1].ratios, alts[1].label),
    ]);

    return {
      ...main,
      budget_ratios: mainRatios,
      ratio_explanation: RATIO_EXPLANATIONS[purpose] ?? null,
      alternatives: [
        { ...alt1, alt_description: alts[0].description },
        { ...alt2, alt_description: alts[1].description },
      ],
    };
  }

  private async buildFromRatios(
    budget: number,
    purpose: string,
    ratios: Record<string, number>,
    label: string,
  ) {
    const suggested: Record<string, any> = {};
    const compatibilityWarnings: string[] = [];
    let totalPrice = 0;

    const addComponent = (key: string, product: Product, categoryBudget: number) => {
      suggested[key] = {
        product,
        budget_allocated: Math.round(categoryBudget),
        over_budget: Number(product.base_price) > categoryBudget * 1.15,
      };
      totalPrice += Number(product.base_price);
    };

    const findBest = async (category: ProductCategory, categoryBudget: number): Promise<Product | null> => {
      const within = await this.productRepo
        .createQueryBuilder('p')
        .where('p.category = :cat', { cat: category })
        .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
        .andWhere('p.base_price <= :budget', { budget: categoryBudget * 1.15 })
        .orderBy('p.base_price', 'DESC').getOne();
      if (within) return within;
      return this.productRepo.createQueryBuilder('p')
        .where('p.category = :cat', { cat: category })
        .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
        .orderBy('p.base_price', 'ASC').getOne();
    };

    // ── Step 1: CPU ──────────────────────────────────────────────────────────
    const cpuBudget = budget * (ratios['cpu'] ?? 0);
    let cpuProduct: Product | null = null;
    if (CATEGORY_MAP['cpu']) {
      cpuProduct = await findBest(CATEGORY_MAP['cpu'], cpuBudget);
      if (cpuProduct) addComponent('cpu', cpuProduct, cpuBudget);
    }

    // ── Step 2: GPU (may skip if iGPU) ───────────────────────────────────────
    const gpuRatio = ratios['gpu'] ?? 0;
    const cpuIGPU = cpuProduct?.specs?.['Integrated Graphics'] ?? cpuProduct?.specs?.integrated_graphics ?? null;
    const cpuHasIGPU = !!cpuIGPU && cpuIGPU.toLowerCase() !== 'none';
    const skipGpu = gpuRatio < 0.15 && cpuHasIGPU;

    // ── Step 3: Non-compatibility components (psu, case, gpu) ────────────────
    for (const key of Object.keys(ratios)) {
      if (['cpu', 'mainboard', 'ram', 'harddrive'].includes(key)) continue;
      if (key === 'gpu' && skipGpu) continue;
      const cat = CATEGORY_MAP[key];
      if (!cat) continue;
      const prod = await findBest(cat, budget * (ratios[key] ?? 0));
      if (prod) addComponent(key, prod, budget * (ratios[key] ?? 0));
    }
    if (skipGpu) compatibilityWarnings.push(`GPU bỏ qua: CPU có đồ họa tích hợp (${cpuIGPU}).`);

    // ── Step 4: Mainboard (socket match) ─────────────────────────────────────
    const mbBudget = budget * (ratios['mainboard'] ?? 0);
    let mbProduct: Product | null = null;
    if (CATEGORY_MAP['mainboard']) {
      const cpuSocket = cpuProduct?.specs?.['Socket'] ?? cpuProduct?.specs?.socket ?? null;
      if (cpuSocket) {
        const socketCond = `(p.specs->>'Socket / CPU' = :socket OR p.specs->>'socket_cpu' = :socket OR p.specs->>'Socket' = :socket)`;
        const mbBase = (qb: SelectQueryBuilder<Product>) => qb
          .where('p.category = :cat', { cat: CATEGORY_MAP['mainboard'] })
          .andWhere(socketCond, { socket: cpuSocket })
          .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0');

        mbProduct = await mbBase(this.productRepo.createQueryBuilder('p'))
          .andWhere('p.base_price <= :budget', { budget: mbBudget * 1.15 })
          .orderBy('p.base_price', 'DESC').getOne();
        if (!mbProduct) {
          mbProduct = await mbBase(this.productRepo.createQueryBuilder('p'))
            .orderBy('p.base_price', 'ASC').getOne();
        }
        if (!mbProduct) {
          compatibilityWarnings.push(`Không tìm mainboard socket ${cpuSocket}.`);
          mbProduct = await findBest(CATEGORY_MAP['mainboard'], mbBudget);
        }
      } else {
        compatibilityWarnings.push(`CPU thiếu thông tin socket — bỏ qua kiểm tra CPU–Mainboard.`);
        mbProduct = await findBest(CATEGORY_MAP['mainboard'], mbBudget);
      }
      if (mbProduct) addComponent('mainboard', mbProduct, mbBudget);
    }

    // ── Step 5: RAM (DDR type + slot count + total GB) ────────────────────────
    const ramBudget = budget * (ratios['ram'] ?? 0);
    if (CATEGORY_MAP['ram']) {
      const mbMemType: string | null = mbProduct?.specs?.['Memory Type'] ?? mbProduct?.specs?.memory_type ?? null;
      const mbSlots = parseInt(String(mbProduct?.specs?.['Memory Slots'] ?? mbProduct?.specs?.memory_slots ?? '4'), 10) || 4;
      const mbMemMax = parseGB(mbProduct?.specs?.['Memory Max'] ?? mbProduct?.specs?.memory_max);

      if (mbMemType) {
        const candidates = await this.productRepo.createQueryBuilder('p')
          .where('p.category = :cat', { cat: CATEGORY_MAP['ram'] })
          .andWhere(`(p.specs->>'Speed' ILIKE :pattern OR p.specs->>'speed' ILIKE :pattern)`, { pattern: `${mbMemType}%` })
          .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
          .andWhere('p.base_price <= :budget', { budget: ramBudget * 1.15 })
          .orderBy('p.base_price', 'DESC').getMany();

        let ramProduct: Product | null = null;
        for (const c of candidates) {
          const parsed = parseRamModules(c.specs?.['Modules'] ?? c.specs?.modules ?? '');
          if (parsed) {
            if (parsed.count > mbSlots) continue;
            if (mbMemMax > 0 && parsed.totalGB > mbMemMax) continue;
          }
          ramProduct = c;
          break;
        }

        // Fallback: any compatible RAM in DB (cheapest first)
        if (!ramProduct) {
          const fallbacks = await this.productRepo.createQueryBuilder('p')
            .where('p.category = :cat', { cat: CATEGORY_MAP['ram'] })
            .andWhere(`(p.specs->>'Speed' ILIKE :pattern OR p.specs->>'speed' ILIKE :pattern)`, { pattern: `${mbMemType}%` })
            .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
            .orderBy('p.base_price', 'ASC').getMany();
          for (const c of fallbacks) {
            const parsed = parseRamModules(c.specs?.['Modules'] ?? c.specs?.modules ?? '');
            if (parsed) {
              if (parsed.count > mbSlots) {
                compatibilityWarnings.push(`RAM "${c.name}": ${parsed.count} thanh vượt quá ${mbSlots} khe mainboard.`);
                continue;
              }
              if (mbMemMax > 0 && parsed.totalGB > mbMemMax) {
                compatibilityWarnings.push(`RAM "${c.name}": ${parsed.totalGB}GB vượt giới hạn ${mbMemMax}GB của mainboard.`);
                continue;
              }
            }
            ramProduct = c;
            break;
          }
        }

        if (!ramProduct) {
          compatibilityWarnings.push(`Không tìm RAM ${mbMemType} tương thích — gợi ý RAM tốt nhất theo ngân sách.`);
          ramProduct = await findBest(CATEGORY_MAP['ram'], ramBudget);
        }
        if (ramProduct) addComponent('ram', ramProduct, ramBudget);
      } else {
        compatibilityWarnings.push(`Mainboard thiếu thông tin loại RAM — bỏ qua kiểm tra Mainboard–RAM.`);
        const fallback = await findBest(CATEGORY_MAP['ram'], ramBudget);
        if (fallback) addComponent('ram', fallback, ramBudget);
      }
    }

    // ── Step 6: HDD/SSD (M.2 slot + SATA compatibility) ─────────────────────
    const hddBudget = budget * (ratios['harddrive'] ?? 0);
    if (CATEGORY_MAP['harddrive']) {
      const mbM2Slots: string[] = (() => {
        const s = mbProduct?.specs?.['M.2 Slots'];
        if (!s) return [];
        if (Array.isArray(s)) return s as string[];
        if (typeof s === 'string') return [s];
        return [];
      })();
      const mbSataPorts = parseSataCount(mbProduct?.specs?.['SATA 6.0 Gb/s Ports'] ?? mbProduct?.specs?.sata_ports);

      let hddProduct: Product | null = null;

      // Prefer M.2 SSD when mainboard has M.2 slots
      if (mbM2Slots.length > 0) {
        const m2Candidates = await this.productRepo.createQueryBuilder('p')
          .where('p.category = :cat', { cat: CATEGORY_MAP['harddrive'] })
          .andWhere(`p.specs->>'Form Factor' ILIKE :m2`, { m2: 'M.2%' })
          .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
          .andWhere('p.base_price <= :budget', { budget: hddBudget * 1.15 })
          .orderBy('p.base_price', 'DESC').getMany();

        for (const c of m2Candidates) {
          const size = parseM2Size(c.specs?.['Form Factor'] ?? '');
          if (!size || m2SizeCompatible(size, mbM2Slots)) {
            hddProduct = c;
            break;
          }
          compatibilityWarnings.push(`SSD "${c.name}" (M.2-${size}) không khớp khe M.2 của mainboard.`);
        }

        // Fallback: cheapest compatible M.2
        if (!hddProduct) {
          const m2Cheap = await this.productRepo.createQueryBuilder('p')
            .where('p.category = :cat', { cat: CATEGORY_MAP['harddrive'] })
            .andWhere(`p.specs->>'Form Factor' ILIKE :m2`, { m2: 'M.2%' })
            .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
            .orderBy('p.base_price', 'ASC').getMany();
          for (const c of m2Cheap) {
            const size = parseM2Size(c.specs?.['Form Factor'] ?? '');
            if (!size || m2SizeCompatible(size, mbM2Slots)) { hddProduct = c; break; }
          }
        }
      }

      // SATA fallback (2.5" / 3.5")
      if (!hddProduct && mbSataPorts > 0) {
        hddProduct = await this.productRepo.createQueryBuilder('p')
          .where('p.category = :cat', { cat: CATEGORY_MAP['harddrive'] })
          .andWhere(`(p.specs->>'Form Factor' ILIKE :f25 OR p.specs->>'Form Factor' ILIKE :f35)`, { f25: '2.5%', f35: '3.5%' })
          .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
          .andWhere('p.base_price <= :budget', { budget: hddBudget * 1.15 })
          .orderBy('p.base_price', 'DESC').getOne();
      }

      // Last resort: any storage
      if (!hddProduct) {
        compatibilityWarnings.push(`Không tìm ổ cứng tương thích — gợi ý ổ tốt nhất theo ngân sách.`);
        hddProduct = await findBest(CATEGORY_MAP['harddrive'], hddBudget);
      }

      if (hddProduct) addComponent('harddrive', hddProduct, hddBudget);
    }

    // ── Step 7: Cooler (only if CPU doesn't include one) ─────────────────────
    if (cpuProduct && CATEGORY_MAP['cooler']) {
      const includesCooler = cpuProduct.specs?.['Includes Cooler'] ?? cpuProduct.specs?.['Includes CPU Cooler'];
      const needsCooler = includesCooler === 'No' || includesCooler === false;
      if (needsCooler) {
        const cpuSocket = cpuProduct.specs?.['Socket'] ?? cpuProduct.specs?.socket ?? null;
        const coolerBudget = budget * 0.05;
        let coolerProduct: Product | null = null;

        if (cpuSocket) {
          coolerProduct = await this.productRepo.createQueryBuilder('p')
            .where('p.category = :cat', { cat: CATEGORY_MAP['cooler'] })
            .andWhere(`p.specs->'CPU Socket' @> :socket::jsonb`, { socket: JSON.stringify([cpuSocket]) })
            .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
            .andWhere('p.base_price <= :budget', { budget: coolerBudget * 1.2 })
            .orderBy('p.base_price', 'DESC').getOne();

          if (!coolerProduct) {
            coolerProduct = await this.productRepo.createQueryBuilder('p')
              .where('p.category = :cat', { cat: CATEGORY_MAP['cooler'] })
              .andWhere(`p.specs->'CPU Socket' @> :socket::jsonb`, { socket: JSON.stringify([cpuSocket]) })
              .andWhere('p.base_price IS NOT NULL').andWhere('p.base_price > 0')
              .orderBy('p.base_price', 'ASC').getOne();
          }
        }

        if (!coolerProduct) {
          coolerProduct = await findBest(CATEGORY_MAP['cooler'], coolerBudget);
          if (coolerProduct) compatibilityWarnings.push(`Không tìm tản nhiệt hỗ trợ socket ${cpuSocket} — chọn tản nhiệt tốt nhất theo ngân sách.`);
        }

        if (coolerProduct) addComponent('cooler', coolerProduct, coolerBudget);
      }
    }

    return {
      purpose,
      budget,
      label,
      total_price: Math.round(totalPrice),
      within_budget: totalPrice <= budget,
      compatibility_warnings: compatibilityWarnings,
      components: suggested,
      budget_ratios: ratios,
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
    const build = await this.buildRepo.findOne({ where: { id: buildId, user_id: userId } });
    if (!build) throw new NotFoundException('Cấu hình không tồn tại');
    if (dto.name !== undefined) build.name = dto.name;
    if (dto.components !== undefined) build.components = dto.components;
    if (dto.total_price !== undefined) build.total_price = dto.total_price;
    return this.buildRepo.save(build);
  }

  async deleteBuild(userId: number, buildId: number) {
    const build = await this.buildRepo.findOne({ where: { id: buildId, user_id: userId } });
    if (!build) throw new NotFoundException('Cấu hình không tồn tại');
    await this.buildRepo.remove(build);
    return { message: 'Đã xóa cấu hình' };
  }
}
