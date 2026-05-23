import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BuildService } from './build.service';
import { SuggestBuildDto, SaveBuildDto, UpdateBuildDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@ApiTags('Builds')
@Controller('builds')
export class BuildController {
  constructor(private readonly buildService: BuildService) { }

  @Get('ratios')
  @ApiOperation({ summary: 'Lấy tỉ lệ ngân sách và giải thích theo từng mục đích' })
  getBudgetRatios() {
    return this.buildService.getBudgetRatios();
  }

  @Post('suggest')
  @ApiOperation({ summary: 'Gợi ý cấu hình PC theo ngân sách' })
  suggest(@Body() dto: SuggestBuildDto) {
    return this.buildService.suggest(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lưu cấu hình PC' })
  saveBuild(
    @CurrentUser('id') userId: number,
    @Body() dto: SaveBuildDto,
  ) {
    return this.buildService.saveBuild(userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Danh sách cấu hình đã lưu' })
  getUserBuilds(@CurrentUser('id') userId: number) {
    return this.buildService.getUserBuilds(userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật cấu hình đã lưu' })
  updateBuild(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) buildId: number,
    @Body() dto: UpdateBuildDto,
  ) {
    return this.buildService.updateBuild(userId, buildId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa cấu hình đã lưu' })
  deleteBuild(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) buildId: number,
  ) {
    return this.buildService.deleteBuild(userId, buildId);
  }
}
