/**
 * PassMark Benchmark Crawler
 * - GPU: https://www.videocardbenchmark.net/gpu_list.php
 *        → khớp theo specs.Chipset của sản phẩm GPU
 * - CPU: https://www.cpubenchmark.net/cpu-list/amd
 *        https://www.cpubenchmark.net/cpu-list/intel
 *        → khớp theo tên sản phẩm CPU
 *
 * Chạy: npm run benchmark:crawl
 */

import puppeteer, { type Browser, type Page } from 'puppeteer';
import { DataSource } from 'typeorm';
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
  synchronize: true,  // tự tạo cột benchmark_score nếu chưa có
});

// ────────────────────────────────────────────────────────────
// Scraping helpers
// ────────────────────────────────────────────────────────────

async function scrapePage(page: Page, url: string): Promise<Map<string, number>> {
  console.log(`  → Fetching ${url} ...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });

  const pairs = await page.evaluate(() => {
    const out: [string, number][] = [];

    // Strategy A: PassMark classic chartlist  (#chartlist li)
    const listItems = Array.from(document.querySelectorAll('#chartlist li'));
    if (listItems.length > 0) {
      for (const li of listItems) {
        const nameEl =
          li.querySelector('.prdname a') ??
          li.querySelector('p.name a') ??
          li.querySelector('a');
        const scoreEl =
          li.querySelector('.mark') ??
          li.querySelector('.count > span') ??
          li.querySelector('span.mark');
        if (!nameEl || !scoreEl) continue;
        const name = nameEl.textContent?.trim() ?? '';
        const score = parseInt((scoreEl.textContent ?? '').replace(/[^0-9]/g, ''), 10);
        if (name && score > 0) out.push([name, score]);
      }
      return out;
    }

    // Strategy B: <table> rows (newer PassMark pages)
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    if (rows.length > 0) {
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) continue;
        // First cell has the name link, second cell has the score
        const nameEl = cells[0].querySelector('a') ?? cells[0];
        const name = nameEl.textContent?.trim() ?? '';
        const raw = cells[1].textContent?.replace(/[^0-9]/g, '') ?? '';
        const score = parseInt(raw, 10);
        if (name && score > 0) out.push([name, score]);
      }
      return out;
    }

    // Strategy C: generic — find all <a> next to a number in the same parent
    const anchors = Array.from(document.querySelectorAll('a[href*="benchmark"]'));
    for (const a of anchors) {
      const parent = a.closest('li, tr, div');
      if (!parent) continue;
      const text = parent.textContent ?? '';
      const numMatch = text.match(/\b(\d{3,6})\b/);
      if (!numMatch) continue;
      const name = a.textContent?.trim() ?? '';
      const score = parseInt(numMatch[1], 10);
      if (name && score > 0) out.push([name, score]);
    }

    return out;
  });

  console.log(`  ✓ Scraped ${pairs.length} entries from ${new URL(url).hostname}`);
  return new Map(pairs);
}

// ────────────────────────────────────────────────────────────
// Name normalisation
// ────────────────────────────────────────────────────────────

function normCpu(s: string): string {
  return s
    .replace(/\s+Processor\s*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s*GHz.*/i, '')     // remove freq onwards
    .replace(/\s+\d+-Core.*/i, '')                  // remove N-Core onwards
    .replace(/\s*\(OEM[^)]*\)/gi, '')
    .replace(/\s*@\s*\d+.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normGpu(s: string): string {
  return s
    .replace(/^(?:NVIDIA|AMD|ATI)\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase();
}

// ────────────────────────────────────────────────────────────
// Matching
// ────────────────────────────────────────────────────────────

/**
 * For CPUs: find the benchmark entry whose (normalised) name best matches
 * the (normalised) product name. We prefer the longest benchmark name that
 * is contained in / is a prefix of the product name.
 */
function matchCpu(
  productName: string,
  benchMap: Map<string, number>,
): { score: number; matched: string } | null {
  const pNorm = normCpu(productName).toLowerCase();

  let best: { score: number; matched: string; len: number } | null = null;

  for (const [bName, bScore] of benchMap) {
    const bNorm = normCpu(bName).toLowerCase();
    // exact match or benchmark name is a prefix/substring of product name
    if (pNorm === bNorm || pNorm.startsWith(bNorm) || pNorm.includes(bNorm)) {
      if (!best || bNorm.length > best.len) {
        best = { score: bScore, matched: bName, len: bNorm.length };
      }
    }
  }

  return best ? { score: best.score, matched: best.matched } : null;
}

/**
 * For GPUs: match specs.Chipset against benchmark name (strip NVIDIA/AMD prefix).
 */
function matchGpu(
  chipset: string,
  benchMap: Map<string, number>,
): { score: number; matched: string } | null {
  const cNorm = normGpu(chipset);

  for (const [bName, bScore] of benchMap) {
    if (normGpu(bName) === cNorm) {
      return { score: bScore, matched: bName };
    }
  }

  // Fallback: partial match (chipset is a substring of benchmark name or vice-versa)
  for (const [bName, bScore] of benchMap) {
    const bNorm = normGpu(bName);
    if (bNorm.includes(cNorm) || cNorm.includes(bNorm)) {
      return { score: bScore, matched: bName };
    }
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

async function main() {
  await dataSource.initialize();
  console.log('✅ Database connected');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    // ── 1. Scrape GPU benchmarks ──────────────────────────────
    console.log('\n📊 Scraping GPU benchmarks...');
    const gpuPage = await browser.newPage();
    await gpuPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    );
    const gpuBench = await scrapePage(gpuPage, 'https://www.videocardbenchmark.net/gpu_list.php');
    await gpuPage.close();

    // ── 2. Scrape CPU benchmarks (AMD + Intel) ────────────────
    console.log('\n📊 Scraping CPU benchmarks...');
    const cpuPage = await browser.newPage();
    await cpuPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    );
    const cpuBenchAmd = await scrapePage(cpuPage, 'https://www.cpubenchmark.net/cpu-list/amd');
    const cpuBenchIntel = await scrapePage(cpuPage, 'https://www.cpubenchmark.net/cpu-list/intel');
    await cpuPage.close();

    // Merge AMD + Intel into one map
    const cpuBench = new Map([...cpuBenchAmd, ...cpuBenchIntel]);
    console.log(`  Total CPU entries: ${cpuBench.size}`);

    // ── 3. Load products from DB ──────────────────────────────
    const products: {
      id: number;
      name: string;
      category: string;
      specs: Record<string, any>;
    }[] = await dataSource.manager.query(`
      SELECT id, name, category, specs FROM products
      WHERE category IN ('cpu', 'gpu')
      ORDER BY category, id
    `);

    console.log(`\n🔍 Matching ${products.length} products...`);

    let updatedCount = 0;
    let skippedCount = 0;
    const noMatch: string[] = [];

    for (const product of products) {
      let result: { score: number; matched: string } | null = null;

      if (product.category === 'cpu') {
        result = matchCpu(product.name, cpuBench);
      } else if (product.category === 'gpu') {
        // Try Chipset key (case-insensitive scan)
        const specsObj = typeof product.specs === 'string'
          ? JSON.parse(product.specs)
          : (product.specs ?? {});
        const chipset = Object.entries(specsObj)
          .find(([k]) => k.toLowerCase() === 'chipset')?.[1] as string | undefined;

        if (chipset) {
          result = matchGpu(chipset, gpuBench);
        } else {
          // Fallback: try product name directly
          result = matchGpu(product.name, gpuBench);
        }
      }

      if (result) {
        await dataSource.manager.query(
          'UPDATE products SET benchmark_score = $1 WHERE id = $2',
          [result.score, product.id],
        );
        console.log(
          `  ✅ [${product.category.toUpperCase()}] #${product.id} "${product.name}"` +
          ` → "${result.matched}" = ${result.score.toLocaleString()}`,
        );
        updatedCount++;
      } else {
        noMatch.push(`[${product.category.toUpperCase()}] #${product.id} "${product.name}"`);
        skippedCount++;
      }
    }

    // ── 4. Summary ────────────────────────────────────────────
    console.log('\n════════════════════════════════════════');
    console.log(`✅ Updated: ${updatedCount} products`);
    console.log(`❌ No match: ${skippedCount} products`);
    if (noMatch.length > 0) {
      console.log('\nSản phẩm không khớp:');
      noMatch.forEach(s => console.log('  ' + s));
    }
  } finally {
    await browser.close();
    await dataSource.destroy();
    console.log('\n🏁 Done.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
