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
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

  // Extra wait for JS-rendered tables
  await page.waitForSelector('table tbody tr, #chartlist li', { timeout: 15_000 }).catch(() => {});

  const hostname = new URL(url).hostname;
  const isCpu = hostname.includes('cpubenchmark');

  const pairs = await page.evaluate((isCpu: boolean) => {
    const out: [string, number][] = [];

    // Normalise a raw text string to a benchmark score.
    // Strips commas/spaces, returns 0 if not a plausible score (>= 100).
    function toScore(txt: string): number {
      const n = parseInt(txt.replace(/[^0-9]/g, ''), 10);
      return Number.isFinite(n) && n >= 100 ? n : 0;
    }

    // ── Strategy 1: PassMark-specific — follow product links ─────────────────
    // cpubenchmark.net  → anchors href="/cpu_lookup.php?cpu=..."
    // videocardbenchmark.net → anchors href="/gpu.php?gpu=..."
    const selector = isCpu ? 'a[href*="cpu_lookup.php"], a[href*="/cpu.php"]' : 'a[href*="gpu_lookup.php"], a[href*="/gpu.php"]';
    const productLinks = Array.from(document.querySelectorAll(selector));

    if (productLinks.length > 0) {
      for (const link of productLinks) {
        const name = link.textContent?.trim() ?? '';
        if (!name) continue;

        // Walk up to the table row and find the score cell (only cells AFTER the name)
        const row = link.closest('tr');
        if (!row) continue;

        const cells = Array.from(row.querySelectorAll('td'));
        let score = 0;
        let passedName = false;
        for (const cell of cells) {
          if (cell.contains(link)) { passedName = true; continue; }
          if (!passedName) continue; // rank column appears before name — skip it
          if (/[a-zA-Z]/.test(cell.textContent ?? '')) continue;
          const s = toScore(cell.textContent ?? '');
          if (s > 0) { score = s; break; }
        }

        if (score > 0) out.push([name, score]);
      }
      if (out.length > 0) return out;
    }

    // ── Strategy 2: Classic PassMark chartlist (#chartlist li) ───────────────
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
        const score = toScore(scoreEl.textContent ?? '');
        if (name && score > 0) out.push([name, score]);
      }
      if (out.length > 0) return out;
    }

    // ── Strategy 3: Generic table — name = <a> with non-numeric text, score = first numeric-only cell ──
    const rows = Array.from(document.querySelectorAll('table tbody tr'));
    if (rows.length > 0) {
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) continue;

        // Name cell = first cell with an <a> whose text is NOT purely numeric
        const nameCell = cells.find(c => {
          const a = c.querySelector('a');
          return a && !/^\s*[\d,]+\s*$/.test(a.textContent ?? '');
        });
        if (!nameCell) continue;
        const name = (nameCell.querySelector('a') as HTMLElement)?.textContent?.trim() ?? '';
        if (!name) continue;

        let score = 0;
        let passedName = false;
        for (const cell of cells) {
          if (cell === nameCell) { passedName = true; continue; }
          if (!passedName) continue;
          if (/[a-zA-Z]/.test(cell.textContent ?? '')) continue;
          const s = toScore(cell.textContent ?? '');
          if (s > 0) { score = s; break; }
        }

        if (score > 0) out.push([name, score]);
      }
      if (out.length > 0) return out;
    }

    // ── Strategy 4: Last-resort — any anchor + last large number in same row ──
    // Normalise comma numbers first ("3,081" → "3081") so regex finds them.
    const allAnchors = Array.from(document.querySelectorAll('a'));
    for (const a of allAnchors) {
      const name = a.textContent?.trim() ?? '';
      if (!name || /^\s*[\d,]+\s*$/.test(name)) continue; // skip pure-number links (ranks)
      const parent = a.closest('li, tr, div');
      if (!parent) continue;
      const normText = (parent.textContent ?? '').replace(/(\d),(\d)/g, '$1$2');
      const allNums = [...normText.matchAll(/\b(\d{3,7})\b/g)];
      if (allNums.length === 0) continue;
      // Use the LAST number — rank typically appears before the name, score after
      const lastNum = parseInt(allNums[allNums.length - 1][1], 10);
      if (lastNum >= 100) out.push([name, lastNum]);
    }

    return out;
  }, isCpu);

  console.log(`  ✓ Scraped ${pairs.length} entries from ${hostname}`);
  return new Map(pairs);
}

// ────────────────────────────────────────────────────────────
// Name normalisation
// ────────────────────────────────────────────────────────────

function normCpu(s: string): string {
  return s
    .replace(/\s+Processor\s*$/i, '')
    .replace(/\s*@.*$/, '')
    .replace(/\s+\d+(?:\.\d+)?\s*GHz.*/i, '')
    .replace(/\s+\d+-Core.*/i, '')
    .replace(/\s*\(OEM[^)]*\)/gi, '')
    .replace(/\bCore(\d)/gi, 'Core $1')             // "Core2" → "Core 2"
    .replace(/([A-Za-z0-9])([vV]\d+)\b/g, '$1 $2') // "E5-2450V2" → "E5-2450 V2"
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

    // 1. Exact match — return immediately
    if (pNorm === bNorm) return { score: bScore, matched: bName };

    // 2. Benchmark name is a prefix of product name, BUT the next character
    //    in the product name must be end-of-string or whitespace — never a
    //    letter/digit/dash that would indicate a different SKU suffix
    //    (e.g. "i3-6100" must NOT match "i3-6100T")
    if (pNorm.startsWith(bNorm)) {
      const next = pNorm[bNorm.length];
      if (next === undefined || next === ' ') {
        if (!best || bNorm.length > best.len) {
          best = { score: bScore, matched: bName, len: bNorm.length };
        }
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
