import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { FilterProductDto, CompareProductsDto, CreateProductDto, UpdateProductDto } from './dto';
import { ProductCategory } from '../../entities';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

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

  // --- Admin endpoints ---

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Tạo sản phẩm mới' })
  createProduct(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Cập nhật sản phẩm' })
  updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Xóa sản phẩm' })
  removeProduct(@Param('id', ParseIntPipe) id: number) {
    return this.productService.remove(id);
  }
}
