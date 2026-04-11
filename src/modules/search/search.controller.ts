import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Tìm kiếm sản phẩm' })
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Query('q') query: string, @Query('limit') limit?: number) {
    return this.searchService.search(query, limit);
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Gợi ý tìm kiếm nhanh' })
  @ApiQuery({ name: 'q', required: true, type: String })
  autocomplete(@Query('q') query: string) {
    return this.searchService.autocomplete(query);
  }
}
