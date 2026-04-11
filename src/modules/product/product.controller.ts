import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { FilterProductDto, CompareProductsDto } from './dto';
import { ProductCategory } from '../../entities';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách linh kiện với filter & phân trang' })
  findAll(@Query() filter: FilterProductDto) {
    return this.productService.findAll(filter);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Danh sách categories và số lượng sản phẩm' })
  getCategories() {
    return this.productService.getCategories();
  }

  @Get('brands')
  @ApiOperation({ summary: 'Danh sách brands, có thể lọc theo category' })
  @ApiQuery({ name: 'category', required: false, enum: ProductCategory })
  getBrands(@Query('category') category?: ProductCategory) {
    return this.productService.getBrands(category);
  }

  @Post('compare')
  @ApiOperation({ summary: 'So sánh 2-4 sản phẩm side-by-side' })
  compare(@Body() dto: CompareProductsDto) {
    return this.productService.compare(dto.ids);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một linh kiện' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Tìm linh kiện theo slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.productService.findBySlug(slug);
  }
}
