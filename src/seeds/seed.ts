import { DataSource } from 'typeorm';
import { Product, ProductCategory } from '../entities/product.entity';
import { Price } from '../entities/price.entity';
import { User, UserRole } from '../entities/user.entity';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'pcparts_user',
  password: process.env.DB_PASSWORD || 'pcparts_secret_2024',
  database: process.env.DB_DATABASE || 'pcparts',
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  synchronize: true,
});

// =================== SEED DATA ===================

const products: Partial<Product>[] = [
  // === CPUs ===
  {
    name: 'Intel Core i5-13400F',
    slug: 'intel-core-i5-13400f',
    category: ProductCategory.CPU,
    brand: 'Intel',
    base_price: 4290000,
    image_url: 'https://placehold.co/400x400/1a1a2e/16213e?text=i5-13400F',
    description: 'CPU Intel thế hệ 13, 10 nhân 16 luồng, hiệu năng mạnh cho gaming và đa nhiệm.',
    specs: {
      cores: 10,
      threads: 16,
      base_clock: '2.5 GHz',
      boost_clock: '4.6 GHz',
      tdp: '65W',
      socket: 'LGA 1700',
      cache: '20MB',
      integrated_gpu: 'Không',
    },
  },
  {
    name: 'Intel Core i7-13700K',
    slug: 'intel-core-i7-13700k',
    category: ProductCategory.CPU,
    brand: 'Intel',
    base_price: 9490000,
    image_url: 'https://placehold.co/400x400/1a1a2e/16213e?text=i7-13700K',
    description: 'CPU Intel cao cấp thế hệ 13, 16 nhân 24 luồng, mở khóa ép xung.',
    specs: {
      cores: 16,
      threads: 24,
      base_clock: '3.4 GHz',
      boost_clock: '5.4 GHz',
      tdp: '125W',
      socket: 'LGA 1700',
      cache: '30MB',
      integrated_gpu: 'Intel UHD 770',
    },
  },
  {
    name: 'Intel Core i9-14900K',
    slug: 'intel-core-i9-14900k',
    category: ProductCategory.CPU,
    brand: 'Intel',
    base_price: 14990000,
    image_url: 'https://placehold.co/400x400/1a1a2e/16213e?text=i9-14900K',
    description: 'CPU Intel flagship thế hệ 14, 24 nhân 32 luồng, hiệu năng đỉnh cao.',
    specs: {
      cores: 24,
      threads: 32,
      base_clock: '3.2 GHz',
      boost_clock: '6.0 GHz',
      tdp: '125W',
      socket: 'LGA 1700',
      cache: '36MB',
      integrated_gpu: 'Intel UHD 770',
    },
  },
  {
    name: 'AMD Ryzen 5 7600X',
    slug: 'amd-ryzen-5-7600x',
    category: ProductCategory.CPU,
    brand: 'AMD',
    base_price: 5690000,
    image_url: 'https://placehold.co/400x400/1a1a2e/e94560?text=R5-7600X',
    description: 'CPU AMD Zen 4, 6 nhân 12 luồng, hiệu năng gaming tốt nhất phân khúc.',
    specs: {
      cores: 6,
      threads: 12,
      base_clock: '4.7 GHz',
      boost_clock: '5.3 GHz',
      tdp: '105W',
      socket: 'AM5',
      cache: '38MB',
      integrated_gpu: 'AMD Radeon Graphics',
    },
  },
  {
    name: 'AMD Ryzen 7 7800X3D',
    slug: 'amd-ryzen-7-7800x3d',
    category: ProductCategory.CPU,
    brand: 'AMD',
    base_price: 9990000,
    image_url: 'https://placehold.co/400x400/1a1a2e/e94560?text=R7-7800X3D',
    description: 'CPU AMD gaming tốt nhất với 3D V-Cache, 8 nhân 16 luồng.',
    specs: {
      cores: 8,
      threads: 16,
      base_clock: '4.2 GHz',
      boost_clock: '5.0 GHz',
      tdp: '120W',
      socket: 'AM5',
      cache: '104MB',
      integrated_gpu: 'AMD Radeon Graphics',
    },
  },
  {
    name: 'AMD Ryzen 9 7950X',
    slug: 'amd-ryzen-9-7950x',
    category: ProductCategory.CPU,
    brand: 'AMD',
    base_price: 13990000,
    image_url: 'https://placehold.co/400x400/1a1a2e/e94560?text=R9-7950X',
    description: 'CPU AMD flagship, 16 nhân 32 luồng, workstation và gaming.',
    specs: {
      cores: 16,
      threads: 32,
      base_clock: '4.5 GHz',
      boost_clock: '5.7 GHz',
      tdp: '170W',
      socket: 'AM5',
      cache: '80MB',
      integrated_gpu: 'AMD Radeon Graphics',
    },
  },

  // === GPUs ===
  {
    name: 'NVIDIA GeForce RTX 4060',
    slug: 'nvidia-geforce-rtx-4060',
    category: ProductCategory.GPU,
    brand: 'NVIDIA',
    base_price: 7990000,
    image_url: 'https://placehold.co/400x400/0f3460/e94560?text=RTX+4060',
    description: 'GPU NVIDIA Ada Lovelace, hiệu năng 1080p gaming tuyệt vời với DLSS 3.',
    specs: {
      vram: '8GB GDDR6',
      boost_clock: '2460 MHz',
      cuda_cores: 3072,
      tdp: '115W',
      bus_width: '128-bit',
      ray_tracing: 'Yes',
      dlss: 'DLSS 3',
    },
  },
  {
    name: 'NVIDIA GeForce RTX 4070',
    slug: 'nvidia-geforce-rtx-4070',
    category: ProductCategory.GPU,
    brand: 'NVIDIA',
    base_price: 14990000,
    image_url: 'https://placehold.co/400x400/0f3460/e94560?text=RTX+4070',
    description: 'GPU NVIDIA 1440p gaming mạnh mẽ, DLSS 3 và ray tracing.',
    specs: {
      vram: '12GB GDDR6X',
      boost_clock: '2475 MHz',
      cuda_cores: 5888,
      tdp: '200W',
      bus_width: '192-bit',
      ray_tracing: 'Yes',
      dlss: 'DLSS 3',
    },
  },
  {
    name: 'NVIDIA GeForce RTX 4080 Super',
    slug: 'nvidia-geforce-rtx-4080-super',
    category: ProductCategory.GPU,
    brand: 'NVIDIA',
    base_price: 27990000,
    image_url: 'https://placehold.co/400x400/0f3460/e94560?text=RTX+4080S',
    description: 'GPU NVIDIA cao cấp, 4K gaming mượt mà với DLSS 3 Frame Generation.',
    specs: {
      vram: '16GB GDDR6X',
      boost_clock: '2550 MHz',
      cuda_cores: 10240,
      tdp: '320W',
      bus_width: '256-bit',
      ray_tracing: 'Yes',
      dlss: 'DLSS 3',
    },
  },
  {
    name: 'AMD Radeon RX 7800 XT',
    slug: 'amd-radeon-rx-7800-xt',
    category: ProductCategory.GPU,
    brand: 'AMD',
    base_price: 12490000,
    image_url: 'https://placehold.co/400x400/0f3460/e94560?text=RX+7800XT',
    description: 'GPU AMD RDNA 3, 1440p gaming tốt nhất phân khúc tầm trung.',
    specs: {
      vram: '16GB GDDR6',
      boost_clock: '2430 MHz',
      stream_processors: 3840,
      tdp: '263W',
      bus_width: '256-bit',
      ray_tracing: 'Yes',
      fsr: 'FSR 3',
    },
  },
  {
    name: 'AMD Radeon RX 7600',
    slug: 'amd-radeon-rx-7600',
    category: ProductCategory.GPU,
    brand: 'AMD',
    base_price: 6990000,
    image_url: 'https://placehold.co/400x400/0f3460/e94560?text=RX+7600',
    description: 'GPU AMD RDNA 3, 1080p gaming giá rẻ.',
    specs: {
      vram: '8GB GDDR6',
      boost_clock: '2655 MHz',
      stream_processors: 2048,
      tdp: '165W',
      bus_width: '128-bit',
      ray_tracing: 'Yes',
      fsr: 'FSR 3',
    },
  },

  // === RAM ===
  {
    name: 'G.Skill Trident Z5 RGB DDR5 32GB (2x16GB) 6000MHz',
    slug: 'gskill-trident-z5-rgb-ddr5-32gb-6000mhz',
    category: ProductCategory.RAM,
    brand: 'G.Skill',
    base_price: 2890000,
    image_url: 'https://placehold.co/400x400/533483/e94560?text=TridentZ5',
    description: 'RAM DDR5 cao cấp với tản nhiệt RGB đẹp mắt.',
    specs: {
      type: 'DDR5',
      capacity: '32GB (2x16GB)',
      speed: '6000 MHz',
      cas_latency: 'CL30',
      voltage: '1.35V',
      rgb: 'Yes',
    },
  },
  {
    name: 'Kingston Fury Beast DDR5 16GB (1x16GB) 5200MHz',
    slug: 'kingston-fury-beast-ddr5-16gb-5200mhz',
    category: ProductCategory.RAM,
    brand: 'Kingston',
    base_price: 1190000,
    image_url: 'https://placehold.co/400x400/533483/e94560?text=FuryBeast',
    description: 'RAM DDR5 giá tốt, tản nhiệt nhôm bền bỉ.',
    specs: {
      type: 'DDR5',
      capacity: '16GB (1x16GB)',
      speed: '5200 MHz',
      cas_latency: 'CL40',
      voltage: '1.25V',
      rgb: 'No',
    },
  },
  {
    name: 'Corsair Vengeance DDR5 32GB (2x16GB) 5600MHz',
    slug: 'corsair-vengeance-ddr5-32gb-5600mhz',
    category: ProductCategory.RAM,
    brand: 'Corsair',
    base_price: 2490000,
    image_url: 'https://placehold.co/400x400/533483/e94560?text=Vengeance',
    description: 'RAM DDR5 hiệu năng cao từ Corsair, tương thích iCUE.',
    specs: {
      type: 'DDR5',
      capacity: '32GB (2x16GB)',
      speed: '5600 MHz',
      cas_latency: 'CL36',
      voltage: '1.25V',
      rgb: 'No',
    },
  },
  {
    name: 'Kingston Fury Beast DDR4 16GB (2x8GB) 3200MHz',
    slug: 'kingston-fury-beast-ddr4-16gb-3200mhz',
    category: ProductCategory.RAM,
    brand: 'Kingston',
    base_price: 890000,
    image_url: 'https://placehold.co/400x400/533483/e94560?text=DDR4+Beast',
    description: 'RAM DDR4 giá rẻ, ổn định cho hệ thống cũ.',
    specs: {
      type: 'DDR4',
      capacity: '16GB (2x8GB)',
      speed: '3200 MHz',
      cas_latency: 'CL16',
      voltage: '1.35V',
      rgb: 'No',
    },
  },

  // === SSDs ===
  {
    name: 'Samsung 990 Pro 1TB NVMe M.2',
    slug: 'samsung-990-pro-1tb',
    category: ProductCategory.SSD,
    brand: 'Samsung',
    base_price: 2890000,
    image_url: 'https://placehold.co/400x400/16213e/0f3460?text=990+Pro',
    description: 'SSD NVMe Gen4 nhanh nhất từ Samsung, đọc 7450 MB/s.',
    specs: {
      capacity: '1TB',
      interface: 'NVMe M.2 PCIe 4.0',
      read_speed: '7450 MB/s',
      write_speed: '6900 MB/s',
      form_factor: 'M.2 2280',
      nand_type: 'V-NAND TLC',
      tbw: '600 TBW',
    },
  },
  {
    name: 'WD Black SN850X 1TB NVMe M.2',
    slug: 'wd-black-sn850x-1tb',
    category: ProductCategory.SSD,
    brand: 'Western Digital',
    base_price: 2490000,
    image_url: 'https://placehold.co/400x400/16213e/0f3460?text=SN850X',
    description: 'SSD NVMe Gen4 hiệu năng cao, tốc độ đọc 7300 MB/s.',
    specs: {
      capacity: '1TB',
      interface: 'NVMe M.2 PCIe 4.0',
      read_speed: '7300 MB/s',
      write_speed: '6300 MB/s',
      form_factor: 'M.2 2280',
      nand_type: 'TLC',
      tbw: '600 TBW',
    },
  },
  {
    name: 'Kingston NV2 1TB NVMe M.2',
    slug: 'kingston-nv2-1tb',
    category: ProductCategory.SSD,
    brand: 'Kingston',
    base_price: 1290000,
    image_url: 'https://placehold.co/400x400/16213e/0f3460?text=NV2',
    description: 'SSD NVMe Gen4 giá rẻ, phù hợp nâng cấp hệ thống.',
    specs: {
      capacity: '1TB',
      interface: 'NVMe M.2 PCIe 4.0',
      read_speed: '3500 MB/s',
      write_speed: '2100 MB/s',
      form_factor: 'M.2 2280',
      nand_type: 'QLC',
      tbw: '320 TBW',
    },
  },
  {
    name: 'Samsung 870 EVO 500GB SATA',
    slug: 'samsung-870-evo-500gb',
    category: ProductCategory.SSD,
    brand: 'Samsung',
    base_price: 1490000,
    image_url: 'https://placehold.co/400x400/16213e/0f3460?text=870+EVO',
    description: 'SSD SATA bền bỉ, phù hợp nâng cấp laptop.',
    specs: {
      capacity: '500GB',
      interface: 'SATA III',
      read_speed: '560 MB/s',
      write_speed: '530 MB/s',
      form_factor: '2.5 inch',
      nand_type: 'V-NAND TLC',
      tbw: '300 TBW',
    },
  },

  // === Mainboards ===
  {
    name: 'ASUS ROG Strix B760-F Gaming WiFi',
    slug: 'asus-rog-strix-b760-f-gaming-wifi',
    category: ProductCategory.MAINBOARD,
    brand: 'ASUS',
    base_price: 5990000,
    image_url: 'https://placehold.co/400x400/e94560/1a1a2e?text=B760-F',
    description: 'Mainboard Intel B760 cao cấp với WiFi 6E, USB-C, Aura Sync RGB.',
    specs: {
      socket: 'LGA 1700',
      chipset: 'Intel B760',
      form_factor: 'ATX',
      ram_slots: 4,
      max_ram: '128GB DDR5',
      m2_slots: 3,
      wifi: 'WiFi 6E',
      usb_ports: '1x USB-C 3.2, 6x USB-A 3.2',
    },
  },
  {
    name: 'MSI MAG B650 Tomahawk WiFi',
    slug: 'msi-mag-b650-tomahawk-wifi',
    category: ProductCategory.MAINBOARD,
    brand: 'MSI',
    base_price: 5490000,
    image_url: 'https://placehold.co/400x400/e94560/1a1a2e?text=B650+Tomahawk',
    description: 'Mainboard AMD B650 chất lượng cao, VRM mạnh, WiFi 6E.',
    specs: {
      socket: 'AM5',
      chipset: 'AMD B650',
      form_factor: 'ATX',
      ram_slots: 4,
      max_ram: '128GB DDR5',
      m2_slots: 2,
      wifi: 'WiFi 6E',
      usb_ports: '1x USB-C 3.2, 8x USB-A 3.2',
    },
  },
  {
    name: 'Gigabyte B760M Aorus Elite AX',
    slug: 'gigabyte-b760m-aorus-elite-ax',
    category: ProductCategory.MAINBOARD,
    brand: 'Gigabyte',
    base_price: 3990000,
    image_url: 'https://placehold.co/400x400/e94560/1a1a2e?text=B760M+Aorus',
    description: 'Mainboard Intel B760 Micro-ATX, WiFi 6E, giá tốt.',
    specs: {
      socket: 'LGA 1700',
      chipset: 'Intel B760',
      form_factor: 'Micro-ATX',
      ram_slots: 2,
      max_ram: '64GB DDR5',
      m2_slots: 2,
      wifi: 'WiFi 6E',
      usb_ports: '1x USB-C 3.2, 4x USB-A 3.2',
    },
  },

  // === PSU ===
  {
    name: 'Corsair RM850x 850W 80+ Gold',
    slug: 'corsair-rm850x-850w',
    category: ProductCategory.PSU,
    brand: 'Corsair',
    base_price: 3290000,
    image_url: 'https://placehold.co/400x400/533483/1a1a2e?text=RM850x',
    description: 'PSU full modular 850W, chứng nhận 80+ Gold, quạt zero RPM.',
    specs: {
      wattage: '850W',
      efficiency: '80+ Gold',
      modular: 'Full Modular',
      fan_size: '135mm',
      connectors: '2x EPS, 4x PCIe, 12x SATA',
      warranty: '10 năm',
    },
  },
  {
    name: 'Cooler Master MWE Gold V2 650W',
    slug: 'cooler-master-mwe-gold-v2-650w',
    category: ProductCategory.PSU,
    brand: 'Cooler Master',
    base_price: 1790000,
    image_url: 'https://placehold.co/400x400/533483/1a1a2e?text=MWE+650W',
    description: 'PSU 650W 80+ Gold, giá tốt cho build tầm trung.',
    specs: {
      wattage: '650W',
      efficiency: '80+ Gold',
      modular: 'Non-Modular',
      fan_size: '120mm',
      connectors: '1x EPS, 2x PCIe, 6x SATA',
      warranty: '5 năm',
    },
  },

  // === Cases ===
  {
    name: 'NZXT H5 Flow',
    slug: 'nzxt-h5-flow',
    category: ProductCategory.CASE,
    brand: 'NZXT',
    base_price: 2490000,
    image_url: 'https://placehold.co/400x400/0f3460/533483?text=H5+Flow',
    description: 'Case ATX mid-tower lưu lượng gió cao, thiết kế tối giản.',
    specs: {
      form_factor: 'Mid Tower ATX',
      max_gpu_length: '365mm',
      max_cpu_cooler_height: '165mm',
      fan_slots: '6x 120mm',
      drive_bays: '2x 2.5", 1x 3.5"',
      side_panel: 'Tempered Glass',
    },
  },
  {
    name: 'Lian Li Lancool II Mesh',
    slug: 'lian-li-lancool-ii-mesh',
    category: ProductCategory.CASE,
    brand: 'Lian Li',
    base_price: 2290000,
    image_url: 'https://placehold.co/400x400/0f3460/533483?text=Lancool+II',
    description: 'Case ATX mesh front tốt nhất phân khúc, airflow tuyệt vời.',
    specs: {
      form_factor: 'Mid Tower ATX',
      max_gpu_length: '384mm',
      max_cpu_cooler_height: '176mm',
      fan_slots: '7x 120mm',
      drive_bays: '3x 2.5", 2x 3.5"',
      side_panel: 'Tempered Glass',
    },
  },

  // === Coolers ===
  {
    name: 'Noctua NH-D15',
    slug: 'noctua-nh-d15',
    category: ProductCategory.COOLER,
    brand: 'Noctua',
    base_price: 2490000,
    image_url: 'https://placehold.co/400x400/16213e/533483?text=NH-D15',
    description: 'Tản nhiệt khí hàng đầu, hiệu năng ngang AIO 240mm.',
    specs: {
      type: 'Air Cooler',
      tdp_support: '250W',
      fan_size: '2x 150mm NF-A15',
      noise_level: '24.6 dBA',
      height: '165mm',
      socket: 'LGA 1700, AM5, AM4',
    },
  },
  {
    name: 'Corsair iCUE H150i Elite LCD XT',
    slug: 'corsair-icue-h150i-elite-lcd-xt',
    category: ProductCategory.COOLER,
    brand: 'Corsair',
    base_price: 6990000,
    image_url: 'https://placehold.co/400x400/16213e/533483?text=H150i+LCD',
    description: 'Tản nhiệt nước AIO 360mm với màn hình LCD trên pump head.',
    specs: {
      type: 'AIO Liquid Cooler',
      radiator_size: '360mm',
      tdp_support: '350W+',
      fan_size: '3x 120mm AF120 RGB',
      noise_level: '20-36 dBA',
      socket: 'LGA 1700, AM5, AM4',
      lcd: '2.1" IPS LCD',
    },
  },

  // === Monitors ===
  {
    name: 'LG 27GP850-B UltraGear 27" 2K 165Hz',
    slug: 'lg-27gp850-b-ultragear',
    category: ProductCategory.MONITOR,
    brand: 'LG',
    base_price: 8990000,
    image_url: 'https://placehold.co/400x400/e94560/0f3460?text=27GP850-B',
    description: 'Màn hình gaming 2K IPS 165Hz, 1ms, Nano IPS, G-Sync.',
    specs: {
      size: '27 inch',
      resolution: '2560x1440 (2K)',
      panel_type: 'Nano IPS',
      refresh_rate: '165Hz',
      response_time: '1ms GTG',
      hdr: 'HDR400',
      adaptive_sync: 'G-Sync Compatible',
    },
  },
  {
    name: 'Samsung Odyssey G5 27" 2K 165Hz VA',
    slug: 'samsung-odyssey-g5-27-2k',
    category: ProductCategory.MONITOR,
    brand: 'Samsung',
    base_price: 5990000,
    image_url: 'https://placehold.co/400x400/e94560/0f3460?text=Odyssey+G5',
    description: 'Màn hình cong gaming 2K VA 165Hz, FreeSync Premium.',
    specs: {
      size: '27 inch',
      resolution: '2560x1440 (2K)',
      panel_type: 'VA',
      refresh_rate: '165Hz',
      response_time: '1ms MPRT',
      hdr: 'HDR10',
      adaptive_sync: 'FreeSync Premium',
      curvature: '1000R',
    },
  },
];

// Price history from different shops
function generatePriceHistory(
  productIdx: number,
  basePrice: number,
): Partial<Price>[] {
  const shops = ['Phong Vũ', 'GearVN', 'An Phát'];
  const prices: Partial<Price>[] = [];
  const now = new Date();

  for (const shop of shops) {
    // Generate 5 historical price points per shop (over last 30 days)
    for (let i = 4; i >= 0; i--) {
      const variation = 1 + (Math.random() * 0.1 - 0.05); // ±5%
      const shopVariation = shop === 'Phong Vũ' ? 1.0 : shop === 'GearVN' ? 0.98 : 1.02;
      const date = new Date(now);
      date.setDate(date.getDate() - i * 7);

      prices.push({
        product_id: productIdx,
        shop_name: shop,
        price: Math.round(basePrice * variation * shopVariation),
        url: `https://www.${shop.toLowerCase().replace(' ', '')}.vn/product/${productIdx}`,
        in_stock: Math.random() > 0.1,
        crawled_at: date,
      });
    }
  }

  return prices;
}

async function seed() {
  console.log('🌱 Connecting to database...');
  await dataSource.initialize();
  console.log('✅ Connected!');

  const productRepo = dataSource.getRepository(Product);
  const priceRepo = dataSource.getRepository(Price);
  const userRepo = dataSource.getRepository(User);

  // Check if data already exists
  const existingProducts = await productRepo.count();
  if (existingProducts > 0) {
    console.log(`⚠️  Database already has ${existingProducts} products. Skipping seed.`);
    console.log('   To re-seed, drop the tables first.');
    await dataSource.destroy();
    return;
  }

  // Create demo user
  console.log('👤 Creating demo user...');
  const passwordHash = await bcrypt.hash('demo123456', 10);
  await userRepo.save({
    email: 'demo@pcparts.vn',
    username: 'demo_user',
    password_hash: passwordHash,
    role: UserRole.USER,
  });
  await userRepo.save({
    email: 'admin@pcparts.vn',
    username: 'admin',
    password_hash: await bcrypt.hash('admin123456', 10),
    role: UserRole.ADMIN,
  });

  // Seed products
  console.log('📦 Seeding products...');
  const savedProducts = await productRepo.save(products as Product[]);
  console.log(`   ✅ Created ${savedProducts.length} products`);

  // Seed price history
  console.log('💰 Seeding price history...');
  let totalPrices = 0;
  for (const product of savedProducts) {
    const priceHistory = generatePriceHistory(product.id, Number(product.base_price));
    await priceRepo.save(priceHistory as Price[]);
    totalPrices += priceHistory.length;
  }
  console.log(`   ✅ Created ${totalPrices} price records`);

  console.log('\n🎉 Seed completed successfully!');
  console.log(`   📦 ${savedProducts.length} products`);
  console.log(`   💰 ${totalPrices} price records`);
  console.log(`   👤 2 users (demo@pcparts.vn / demo123456, admin@pcparts.vn / admin123456)`);

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
