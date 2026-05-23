import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import puppeteer from 'puppeteer';
import type { Browser } from 'puppeteer';

import { Product } from '../../entities/product.entity';
import { Price } from '../../entities/price.entity';
import type { CrawlResult, ShopResult } from './price-crawler.types';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
];


interface ShopConfig {
    name: string;
    searchUrl: (q: string) => string;
    /** CSS selector cho product card container */
    containerSel: string;
    /** CSS selector cho tên sản phẩm (relative to container) */
    nameSel: string;
    /** CSS selector cho giá (relative to container) */
    priceSel: string;
    /** CSS selector cho link sản phẩm; rỗng nếu container tự là <a> */
    linkSel: string;
    /** Chờ networkidle2 thay vì domcontentloaded (cho các SPA tải chậm) */
    waitUntil?: 'domcontentloaded' | 'networkidle2';
    /** Timeout cho waitForSelector (ms), mặc định 8000 */
    selectorTimeout?: number;
}

// Selectors lấy từ DevTools của từng shop
const SHOPS: ShopConfig[] = [
    {
        name: 'Phong Vũ',
        // Phong Vũ dùng router=productListing&query=, không phải ?q=
        searchUrl: q => `https://phongvu.vn/search?router=productListing&query=${encodeURIComponent(q)}`,
        containerSel: '.product-card',
        nameSel: '.att-product-card-title',    // class ổn định; tránh bắt text "TIẾT KIỆM..."
        priceSel: '[color="primary500"][type="subtitle"]',
        linkSel: 'a',
    },
    {
        name: 'GearVN',
        searchUrl: q => `https://gearvn.com/search?q=${encodeURIComponent(q)}`,
        containerSel: '.proloop',
        nameSel: '.proloop-name',
        priceSel: '.proloop-price--highlight',
        linkSel: '.proloop-name a',
    },
    {
        name: 'An Phát Computer',
        // Domain thực là anphatpc.com.vn (không phải anphat.vn), tìm kiếm qua /tim?q=
        searchUrl: q => `https://www.anphatpc.com.vn/tim?q=${encodeURIComponent(q)}`,
        containerSel: '.p-item.js-p-item',    // div.p-item (không phải .product-item)
        nameSel: '.p-name h3',                // <h3> bên trong <a class="p-name">
        priceSel: '.p-price',
        linkSel: 'a.p-name',
        waitUntil: 'networkidle2',
        selectorTimeout: 12000,
    },
    {
        name: 'TNC Store',
        searchUrl: q => `https://www.tncstore.vn/tim?q=${encodeURIComponent(q)}`,
        containerSel: '.product-item.js-p-item',
        nameSel: 'a.product-name',
        priceSel: 'b.price',
        linkSel: 'a.product-name',
    },
    {
        name: 'Tinhocngoisao',
        searchUrl: q => `https://tinhocngoisao.com/search?q=filter=(title:product%20contains%20${encodeURIComponent(q)})||(sku:product%20contains%20${encodeURIComponent(q)})&sortby=sold_quantity:product=desc`,
        containerSel: 'div.product-item',
        nameSel: 'h3.pdLoopName a',
        priceSel: '.pdPrice span',
        linkSel: 'a.product-link',
        waitUntil: 'networkidle2',
        selectorTimeout: 12000,
    },
    {
        name: 'Hotgear',
        searchUrl: q => `https://hotgear.vn/search?type=product&q=${encodeURIComponent(q)}`,
        containerSel: 'div.item_product_main',
        nameSel: 'h3.product-name a',
        priceSel: '.price-box span.price',
        linkSel: 'h3.product-name a',
        waitUntil: 'networkidle2',
        selectorTimeout: 12000,
    },
];

@Injectable()
export class PriceCrawlerService {
    private readonly logger = new Logger(PriceCrawlerService.name);
    private isCrawling = false;
    private stopRequested = false;
    private readonly logBuffer: string[] = [];
    private readonly LOG_BUFFER_MAX = 300;

    constructor(
        @InjectRepository(Product)
        private readonly productRepo: Repository<Product>,
        @InjectRepository(Price)
        private readonly priceRepo: Repository<Price>,
    ) { }

    // ── Status / control ──────────────────────────────────────────────────────

    async getCrawlStatus() {
        const recentlyCrawled: {
            id: number; name: string; category: string; brand: string;
            last_crawled: string; shop_count: number; min_price: number;
        }[] = await this.priceRepo.manager.query(`
            SELECT p.id, p.name, p.category, p.brand,
                   MAX(pr.crawled_at)          AS last_crawled,
                   COUNT(DISTINCT pr.shop_name)::int AS shop_count,
                   MIN(pr.price)::int          AS min_price
            FROM prices pr
            JOIN products p ON p.id = pr.product_id
            GROUP BY p.id, p.name, p.category, p.brand
            ORDER BY last_crawled DESC
            LIMIT 15
        `);
        return { isCrawling: this.isCrawling, logs: [...this.logBuffer], recentlyCrawled };
    }

    stopCrawl() {
        if (this.isCrawling) this.stopRequested = true;
    }

    async getProductsWithoutPrices(): Promise<{ id: number; name: string; category: string; brand: string }[]> {
        return this.productRepo.manager.query(`
            SELECT p.id, p.name, p.category, p.brand
            FROM products p
            WHERE NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id)
            ORDER BY p.category, p.id
        `);
    }

    private crawlLog(msg: string) {
        const ts = new Date().toLocaleTimeString('vi-VN', { hour12: false });
        const entry = `[${ts}] ${msg}`;
        this.logBuffer.push(entry);
        if (this.logBuffer.length > this.LOG_BUFFER_MAX) this.logBuffer.shift();
        this.logger.log(msg);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ══════════════════════════════════════════════════════════════════════════

    async crawlByProductId(productId: number): Promise<CrawlResult> {
        const product = await this.productRepo.findOne({ where: { id: productId } });
        if (!product) throw new Error(`Product #${productId} không tồn tại`);
        const browser = await this.launchBrowser();
        try {
            return await this.crawlProduct(product, browser);
        } finally {
            await browser.close();
        }
    }

    async crawlAllProducts(fromId?: number, toId?: number): Promise<CrawlResult[]> {
        const qb = this.productRepo.createQueryBuilder('p').orderBy('p.id', 'ASC');
        if (fromId !== undefined) qb.andWhere('p.id >= :fromId', { fromId });
        if (toId !== undefined) qb.andWhere('p.id <= :toId', { toId });
        const products = await qb.getMany();
        return this.crawlProductList(products);
    }

    async crawlMissingPrices(): Promise<CrawlResult[]> {
        const products: Product[] = await this.productRepo.manager.query(`
            SELECT p.*
            FROM products p
            WHERE NOT EXISTS (SELECT 1 FROM prices pr WHERE pr.product_id = p.id)
            ORDER BY p.id
        `);
        this.crawlLog(`🔍 Tìm thấy ${products.length} sản phẩm chưa có giá.`);
        return this.crawlProductList(products);
    }

    // Cron: mỗi category lấy 100 sản phẩm có giá cũ nhất (hoặc chưa có giá)
    async crawlSmartCron(): Promise<CrawlResult[]> {
        const CATEGORIES = ['cpu', 'gpu', 'ram', 'harddrive', 'mainboard', 'psu', 'case', 'cooler', 'monitor'];
        const allProducts: Product[] = [];
        for (const cat of CATEGORIES) {
            const rows: Product[] = await this.productRepo.manager.query(`
                SELECT p.*
                FROM products p
                WHERE p.category = $1
                ORDER BY (
                    SELECT MAX(pr.crawled_at) FROM prices pr WHERE pr.product_id = p.id
                ) ASC NULLS FIRST
                LIMIT 100
            `, [cat]);
            allProducts.push(...rows);
        }
        this.crawlLog(`📋 Smart cron: ${allProducts.length} sản phẩm từ ${CATEGORIES.length} categories.`);
        return this.crawlProductList(allProducts);
    }

    // ── Core list crawl ───────────────────────────────────────────────────────

    private async crawlProductList(products: Product[]): Promise<CrawlResult[]> {
        if (this.isCrawling) {
            this.crawlLog('⚠️ Crawl đang chạy, bỏ qua để tránh chạy song song.');
            return [];
        }
        this.isCrawling = true;
        this.stopRequested = false;
        this.crawlLog(`🚀 Bắt đầu crawl ${products.length} sản phẩm...`);

        const results: CrawlResult[] = [];
        const CONCURRENCY = 3;
        const BROWSER_RESTART_EVERY = 30;
        let browser = await this.launchBrowser();
        let processedSinceRestart = 0;

        try {
            for (let i = 0; i < products.length; i += CONCURRENCY) {
                if (this.stopRequested) {
                    this.crawlLog('🛑 Crawl bị dừng theo yêu cầu admin.');
                    break;
                }

                if (processedSinceRestart >= BROWSER_RESTART_EVERY) {
                    this.crawlLog('♻️ Khởi động lại browser để giải phóng bộ nhớ...');
                    await browser.close();
                    browser = await this.launchBrowser();
                    processedSinceRestart = 0;
                }

                const batch = products.slice(i, i + CONCURRENCY);
                const batchResults = await Promise.all(
                    batch.map(product =>
                        this.crawlProduct(product, browser)
                            .then(result => {
                                this.crawlLog(`✅ ${product.name}: saved ${result.saved_count} prices`);
                                return result;
                            })
                            .catch(err => {
                                const message = err instanceof Error ? err.message : String(err);
                                this.crawlLog(`❌ ${product.name}: ${message}`);
                                return null;
                            }),
                    ),
                );
                results.push(...batchResults.filter((r): r is CrawlResult => r !== null));
                processedSinceRestart += batch.length;

                if (i + CONCURRENCY < products.length) {
                    await this.sleepRandom(2000, 4000);
                }
            }
        } finally {
            await browser.close();
            this.isCrawling = false;
            this.stopRequested = false;
            const saved = results.reduce((s, r) => s + r.saved_count, 0);
            this.crawlLog(`🏁 Hoàn thành. ${results.length} sản phẩm, ${saved} bản ghi giá mới.`);
        }

        return results;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CORE CRAWL FLOW
    // ══════════════════════════════════════════════════════════════════════════

    private async crawlProduct(product: Product, browser: Browser): Promise<CrawlResult> {
        const errors: string[] = [];

        let cleanName = product.name
            .replace(/\n/g, ' ')
            .replace(/\(.*?\)/g, '')
            .replace(/\d+\.?\d*\s*GHz.*/gi, '')
            .replace(/\d+-Core.*/gi, '')
            .replace(/\b(Processor|Video|Card|Memory|Internal Hard Drive|ATX|Mid|Tower|Case|MicroATX|Mini|ITX|Full)\b/gi, '')
            .replace(/\bCL[-\s]?\d+\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Ổ cứng: chỉ giữ tên model + dung lượng, bỏ form factor / giao tiếp / RPM / "Solid State Drive"...
        if (product.category === 'harddrive') {
            cleanName = PriceCrawlerService.parseHarddriveName(cleanName);
        }

        // Mainboard: bỏ socket (AM4/AM5/LGA1700...), form factor còn sót (EATX, Micro), "Motherboard"
        if (product.category === 'mainboard') {
            cleanName = PriceCrawlerService.parseMainboardName(cleanName);
        }

        // PSU: bỏ "80+ Gold Certified Fully Modular ATX Power Supply", chuẩn hoá "850 W" → "850W"
        if (product.category === 'psu') {
            cleanName = PriceCrawlerService.parsePsuName(cleanName);
        }

        // Một số shop dùng khoảng trắng thay gạch ngang trong tên model (vd "i5 12600KF" thay vì "i5-12600KF")
        const searchQuery = cleanName.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        this.logger.debug(`🔍 Crawling prices for: "${searchQuery}"`);

        const shopResults = await this.searchAllShops(searchQuery, product.category, browser);
        this.logger.debug(`Found ${shopResults.length} shops for "${product.name}"`);

        const saveSettled = await Promise.allSettled(
            shopResults.map(shop => this.upsertPrice(product.id, shop)),
        );
        let savedCount = 0;
        for (const [i, res] of saveSettled.entries()) {
            if (res.status === 'fulfilled') {
                savedCount++;
            } else {
                const message = res.reason instanceof Error ? res.reason.message : String(res.reason);
                errors.push(`Save failed [${shopResults[i].shop_name}]: ${message}`);
            }
        }

        // Đồng bộ giá thấp nhất tìm được về base_price để ProductCard hiển thị đúng
        if (shopResults.length > 0) {
            const minPrice = Math.min(...shopResults.map(r => r.price));
            await this.productRepo.update(product.id, { base_price: minPrice });
        }

        return {
            product_id: product.id,
            product_name: product.name,
            results: shopResults,
            saved_count: savedCount,
            errors,
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHOP SEARCH — chia sẻ 1 browser instance cho tất cả shops
    // ══════════════════════════════════════════════════════════════════════════

    private launchBrowser(): Promise<Browser> {
        return puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--disable-plugins',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--renderer-process-limit=4',
            ],
        });
    }

    // Mở các shop theo từng batch nhỏ để giới hạn số tab đồng thời
    private async searchAllShops(productName: string, category: string, browser: Browser): Promise<ShopResult[]> {
        const results: ShopResult[] = [];
        const SHOP_BATCH = 3; // tối đa 3 tab/lần thay vì mở hết 6 cùng lúc
        for (let i = 0; i < SHOPS.length; i += SHOP_BATCH) {
            const batch = SHOPS.slice(i, i + SHOP_BATCH);
            const settled = await Promise.all(
                batch.map(shop =>
                    this.scrapeShop(shop, shop.searchUrl(productName), productName, category, browser)
                        .catch(err => {
                            this.logger.warn(`[${shop.name}] failed: ${err instanceof Error ? err.message : err}`);
                            return null;
                        }),
                ),
            );
            results.push(...settled.filter((r): r is ShopResult => r !== null));
        }
        return results;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PER-SHOP SCRAPER
    // ══════════════════════════════════════════════════════════════════════════

    private async scrapeShop(
        config: ShopConfig,
        searchUrl: string,
        productName: string,
        category: string,
        browser: Browser,
    ): Promise<ShopResult | null> {
        this.logger.debug(`🔍 [${config.name}] ${searchUrl}`);
        const page = await browser.newPage();
        let pageActive = true;

        try {
            // Ẩn dấu hiệu headless để tránh bot detection (quan trọng cho CellphoneS)
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).chrome = { runtime: {} };
            });

            // Chặn image/font/media để tăng tốc độ tải trang
            // .catch() bắt "Request is already handled" khi page đóng giữa chừng
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (!pageActive) return;
                if (['image', 'font', 'media'].includes(req.resourceType())) {
                    req.abort().catch(() => {});
                } else {
                    req.continue().catch(() => {});
                }
            });

            await page.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
            await page.setExtraHTTPHeaders({ 'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8' });
            await page.goto(searchUrl, {
                waitUntil: config.waitUntil ?? 'domcontentloaded',
                timeout: 25000,
            });

            // Đợi product container xuất hiện sau khi JS render xong
            await page
                .waitForSelector(config.containerSel, { timeout: config.selectorTimeout ?? 8000 })
                .catch(() => this.logger.debug(`[${config.name}] waitForSelector timeout — proceeding`));

            // Từ khóa cần LOẠI TRỪ theo category để tránh match nhầm sang sản phẩm khác loại
            const CATEGORY_BLACKLIST: Record<string, RegExp> = {
                mainboard: /\b(vga|gpu|rtx|gtx|rx\s*\d|radeon|geforce|tản\s*nhiệt|cooler|nguồn|psu)\b/i,
                gpu:       /\b(mainboard|motherboard|bo\s*mạch|nguồn|psu|tản\s*nhiệt|cooler)\b/i,
                cpu:       /\b(mainboard|motherboard|bo\s*mạch|vga|gpu|rtx|gtx|tản\s*nhiệt|cooler)\b/i,
                psu:       /\b(mainboard|motherboard|vga|gpu|tản\s*nhiệt|cooler|ổ\s*cứng|ssd|hdd)\b/i,
                cooler:    /\b(mainboard|motherboard|vga|gpu|nguồn|psu|ổ\s*cứng|ram)\b/i,
                ram:       /\b(mainboard|motherboard|vga|gpu|tản\s*nhiệt|nguồn|ổ\s*cứng|ssd)\b/i,
                harddrive: /\b(mainboard|motherboard|vga|gpu|ram|tản\s*nhiệt|nguồn|case)\b/i,
            };
            const params = {
                pName: productName,
                containerSel: config.containerSel,
                nameSel: config.nameSel,
                priceSel: config.priceSel,
                linkSel: config.linkSel,
                blacklistPattern: CATEGORY_BLACKLIST[category]?.source ?? null,
                blacklistFlags: CATEGORY_BLACKLIST[category]?.flags ?? 'i',
            };

            const result = await page.evaluate((p) => {
                const { pName, containerSel, nameSel, priceSel, linkSel, blacklistPattern, blacklistFlags } = p;
                const blacklist = blacklistPattern ? new RegExp(blacklistPattern, blacklistFlags) : null;
                const items = Array.from(document.querySelectorAll(containerSel));
                console.log(`${containerSel} → ${items.length} items`);

                type Match = { title: string; price: number; href: string };
                const matches: Match[] = [];

                for (const item of items.slice(0, 20)) {
                    // Lấy tên: ưu tiên title attribute (tránh text lẫn giá/thương hiệu)
                    const nameEl = nameSel ? item.querySelector(nameSel) : null;
                    const rawTitle = (() => {
                        if (nameEl) {
                            const a = nameEl.getAttribute('title');
                            return (a && a.length > 5) ? a : (nameEl.textContent || '');
                        }
                        const a = item.getAttribute('title');
                        return (a && a.length > 5) ? a : (item.textContent || '');
                    })();
                    const titleText = rawTitle.replace(/\s+/g, ' ').trim();
                    if (!titleText) continue;

                    // Lọc sản phẩm bundle (bộ PC đóng gói chứa nhiều linh kiện)
                    if (/\bPC\b\s+(Gaming|PV\b|Văn\s+phòng|Office|AMD|Intel)/i.test(titleText)
                        || /Bộ\s+máy\s+tính/i.test(titleText)) continue;

                    // Lọc sản phẩm sai danh mục (mainboard không được match VGA, v.v.)
                    if (blacklist && blacklist.test(titleText)) continue;

                    // Khớp từ khóa — loại bỏ stopword; giữ lại từ 2 ký tự nếu có chứa số (64, i7...)
                    const words = pName
                        .toLowerCase()
                        .split(/[\s\-]+/)
                        .filter((w: string) => (w.length > 2 || (w.length === 2 && /\d/.test(w))) && !['mua', 'gia', 'ban'].includes(w));

                    // Từ chứa số = model code (9800X3D, 4090, i9-14900K...) — bắt buộc khớp đầy đủ
                    const modelWords = words.filter((w: string) => /\d/.test(w));
                    const nonModelWords = words.filter((w: string) => !/\d/.test(w));
                    const titleLower = titleText.toLowerCase();

                    // Chuẩn hóa title của shop: tính tổng dung lượng kit RAM ("2 x 32GB" → "64GB"),
                    // bỏ thông số PCIe ("PCIe 4.0 x4", "Gen 4.0 x4") để tránh false-match với dung lượng,
                    // bỏ đơn vị MHz/GHz/GB/TB để \b word-boundary khớp đúng ("5200MHz"→"5200", "4TB"→"4")
                    const titleNorm = titleLower
                        .replace(/(\d+)\s*[×x]\s*(\d+)\s*gb/gi, function (_, a, b) { return String(+a * +b) + 'gb'; })
                        .replace(/(\d+)\s*gb\s*[×x]\s*(\d+)/gi, function (_, a, b) { return String(+a * +b) + 'gb'; })
                        .replace(/\bpcie\s*(?:gen\s*)?\d+(?:\.\d+)?(?:\s*x\s*\d+)?\b/gi, '')
                        .replace(/\bgen\s*\d+(?:\.\d+)?(?:\s*x\s*\d+)?\b/gi, '')
                        .replace(/(\d+(?:\.\d+)?)\s*mhz/gi, '$1')
                        .replace(/(\d+(?:\.\d+)?)\s*ghz/gi, '$1')
                        .replace(/(\d+)\s*gb(?!\w)/gi, '$1')
                        .replace(/(\d+)\s*tb(?!\w)/gi, '$1')
                        .replace(/(\d+)\s*mb(?!\w)/gi, '$1');

                    // Chuẩn hoá model word từ DB: bỏ đơn vị đính kèm ("4tb"→"4", "500gb"→"500")
                    // để khớp được với titleNorm đã strip unit
                    const stripUnit = (w: string) => w.replace(/^(\d+(?:\.\d+)?)(mhz|ghz|gb|tb|mb)$/i, '$1');

                    // Dùng word-boundary (\b) để "5600" không khớp với "5600X", "5600G", v.v.
                    // So sánh trên titleNorm để "5200" khớp được "5200MHz", "4TB" khớp được "4TB"/"4 TB"
                    if (modelWords.length > 0 && !modelWords.every((w: string) => {
                        const norm = stripUnit(w);
                        const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        return new RegExp('\\b' + esc + '\\b').test(titleNorm);
                    })) continue;

                    // Ít nhất 50% từ thường phải khớp
                    const nonModelHits = nonModelWords.filter((w: string) => titleLower.includes(w)).length;
                    if (nonModelWords.length > 0 && nonModelHits < Math.ceil(nonModelWords.length * 0.5)) continue;

                    // Lấy giá từ selector cụ thể; nếu không có thì tìm trong toàn bộ text
                    const priceEl = priceSel ? item.querySelector(priceSel) : null;
                    const searchText = priceEl?.textContent ?? item.textContent ?? '';
                    const priceMatch = searchText.match(/\d[\d.,]{4,}/);
                    if (!priceMatch) continue;

                    const price = parseInt(priceMatch[0].replace(/[.,]/g, ''), 10);
                    if (price < 100_000 || price > 1_000_000_000) continue;

                    // Lấy URL sản phẩm
                    const isAnchor = item.tagName === 'A';
                    const linkEl = isAnchor
                        ? (item as HTMLAnchorElement)
                        : ((linkSel
                            ? item.querySelector(linkSel)
                            : item.querySelector('a')) as HTMLAnchorElement | null);
                    const href = linkEl?.href ?? '';

                    const displayTitle = titleText.slice(0, 100);
                    matches.push({ title: displayTitle, price, href });
                }

                console.log(`matches: ${matches.length}`);
                if (!matches.length) return null;

                // Nếu có nhiều sản phẩm trùng khớp → lấy giá thấp nhất
                return matches.reduce((min, cur) => (cur.price < min.price ? cur : min));
            }, params);

            if (!result) return null;

            this.logger.debug(
                `✨ [${config.name}] "${result.title}" → ${result.price.toLocaleString()}đ`,
            );

            return {
                shop_name: config.name,
                price: result.price,
                url: result.href || searchUrl,
                in_stock: true,
            };
        } finally {
            pageActive = false;
            page.removeAllListeners();
            await page.close();
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DATABASE
    // ══════════════════════════════════════════════════════════════════════════

    private async upsertPrice(productId: number, shop: ShopResult): Promise<void> {
        const existing = await this.priceRepo.findOne({
            where: { product_id: productId, shop_name: shop.shop_name },
        });

        if (existing) {
            existing.price = shop.price;
            existing.url = shop.url;
            existing.in_stock = shop.in_stock;
            existing.crawled_at = new Date();
            await this.priceRepo.save(existing);
        } else {
            await this.priceRepo.save(
                this.priceRepo.create({
                    product_id: productId,
                    shop_name: shop.shop_name,
                    price: shop.price,
                    url: shop.url,
                    in_stock: shop.in_stock,
                    crawled_at: new Date(),
                }),
            );
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Giữ lại tên model + dung lượng, bỏ hết hậu tố form factor / giao tiếp.
     * "Samsung 990 Pro 4 TB M.2-2280 PCIe 4.0 X4 NVME Solid State Drive" → "Samsung 990 Pro 4TB"
     */
    static parseHarddriveName(name: string): string {
        const m = name.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(TB|GB)\b/i);
        if (!m) return name;
        return `${m[1].trim()} ${m[2]}${m[3].toUpperCase()}`;
    }

    /**
     * Bỏ socket (AM4/AM5/LGA1700...), form factor còn sót sau cleanName (EATX, Micro), "Motherboard".
     * cleanName đã strip ATX/Mini/ITX trước khi gọi hàm này.
     * "Gigabyte B850 AORUS ELITE WIFI7 AM5 Motherboard" → "Gigabyte B850 AORUS ELITE WIFI7"
     */
    static parseMainboardName(name: string): string {
        return name
            .replace(/\s+Motherboard\s*$/i, '')
            .replace(/\s+(AM[3-5][+]?|TR[X]?4|sTRX40|LGA\d{3,4})\b.*$/i, '')
            .replace(/\s+(E[-\s]?ATX|EATX|Micro|mATX)\s*$/i, '')
            .trim();
    }

    /**
     * Giữ lại tên model + công suất, bỏ "80+ Gold Certified Fully Modular ATX Power Supply".
     * "Corsair CX (2023) 650 W 80+ Bronze Certified ATX Power Supply" → "Corsair CX 650W"
     * "Apevia CAPTAIN 550 W ATX Power Supply" → "Apevia CAPTAIN 550W"
     */
    static parsePsuName(name: string): string {
        return name
            .replace(/\s+80\+.*$/i, '')
            .replace(/\s+Power Supply\s*$/i, '')
            .replace(/(\d+)\s+W\b/g, '$1W')
            .trim();
    }

    private sleepRandom(min: number, max: number): Promise<void> {
        const ms = Math.floor(Math.random() * (max - min + 1) + min);
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
