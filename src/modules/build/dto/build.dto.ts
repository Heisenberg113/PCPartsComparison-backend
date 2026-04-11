import { IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
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
}

export class SaveBuildDto {
  @ApiProperty({ example: 'Gaming Build 20M' })
  @IsString()
  name: string;

  @ApiProperty({
    example: { cpu: 1, gpu: 7, ram: 12, ssd: 16, mainboard: 20, psu: 23, case: 25 },
  })
  components: Record<string, number>;

  @ApiProperty({ example: 20000000 })
  @Type(() => Number)
  @IsNumber()
  total_price: number;
}
