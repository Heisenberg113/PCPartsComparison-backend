import { IsInt, IsString, Min, Max, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReviewDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  product_id: number;

  @ApiProperty({ example: 4, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Sản phẩm rất tốt, hiệu năng mạnh mẽ' })
  @IsString()
  @MinLength(10)
  content: string;
}

export class UpdateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Cập nhật: vẫn rất hài lòng sau 1 tháng sử dụng' })
  @IsString()
  @MinLength(10)
  content: string;
}
