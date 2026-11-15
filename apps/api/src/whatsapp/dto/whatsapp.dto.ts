import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ResyncHistoryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  depthHours?: number;
}
