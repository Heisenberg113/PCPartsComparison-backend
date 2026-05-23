import { IsNumber, IsOptional, IsString, IsObject, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SuggestBuildDto {
  @ApiProperty({ example: 20000000, description: 'Ngân sách (VND)' })
  @Type(() => Number)
  @IsNumber()
  @Min(5000000)
  budget: number;

  @ApiPropertyOptional({
    example: 'gaming',
    enum: ['gaming', 'workstation', 'office', 'streaming'],
  })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({
    description: 'Tỉ lệ ngân sách tùy chỉnh, e.g. {"cpu":0.25,"gpu":0.35,...}',
    example: { cpu: 0.25, gpu: 0.35, ram: 0.10, harddrive: 0.08, mainboard: 0.10, psu: 0.07, case: 0.05 },
  })
  @IsOptional()
  @IsObject()
  custom_ratios?: Record<string, number>;
}

export class SaveBuildDto {
  @ApiProperty({ example: 'Gaming Build 20M' })
  @IsString()
  name: string;

  @ApiProperty({
    example: { cpu: 1, gpu: 7, ram: 12, harddrive: 16, mainboard: 20, psu: 23, case: 25 },
  })
  @IsObject()
  components: Record<string, any>;

  @ApiProperty({ example: 20000000 })
  @Type(() => Number)
  @IsNumber()
  total_price: number;
}

export class UpdateBuildDto {
  @ApiPropertyOptional({ example: 'Gaming Build Updated' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  components?: Record<string, any>;

  @ApiPropertyOptional({ example: 22000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  total_price?: number;
}
