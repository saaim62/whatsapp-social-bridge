import { IsArray, IsBoolean, IsString, MinLength } from 'class-validator';

export class ToggleSourceDto {
  @IsBoolean()
  isEnabled: boolean;
}

export class UpdateSourceNameDto {
  @IsString()
  @MinLength(1)
  name: string;
}

export class BulkDeleteSourcesDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}
