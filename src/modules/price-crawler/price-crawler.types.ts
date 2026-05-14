// price-crawler.types.ts

export interface ShopResult {
    shop_name: string;
    price: number;
    url: string;
    in_stock: boolean;
}

export interface CrawlResult {
    product_id: number;
    product_name: string;
    results: ShopResult[];
    saved_count: number;
    errors: string[];
}