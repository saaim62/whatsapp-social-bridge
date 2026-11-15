import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * The only fields a client may write through POST /api/settings.
 * SettingsService re-validates every value before persisting; this DTO
 * exists so the global ValidationPipe can reject malformed or unknown
 * properties at the edge instead of letting them reach the service.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  isSyncActive?: boolean;

  @IsOptional()
  @IsNumber()
  historySyncDepthHours?: number;

  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  marginType?: 'PERCENT' | 'FIXED';

  @IsOptional()
  @IsNumber()
  marginValue?: number;

  @IsOptional()
  @IsNumber()
  priceRounding?: number;

  @IsOptional()
  @IsString()
  captionFooter?: string | null;
}
