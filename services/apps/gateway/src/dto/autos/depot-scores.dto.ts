import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class DepotScoresRequestDto {
  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  maximum_results?: number = 100;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  page?: string;
}

export class DepotScoreResultDto {
  @ApiProperty()
  depot_id: number;

  @ApiProperty()
  score: number;
}

export class DepotScoresResponseDto {
  @ApiProperty()
  request_id: string;

  @ApiProperty({ type: [DepotScoreResultDto] })
  data: DepotScoreResultDto[];

  @ApiProperty()
  metadata: Record<string, unknown>;
}
