import { IsOptional, IsString, MinLength } from 'class-validator';

export class SaveMetaDestinationDto {
  @IsString()
  @MinLength(1)
  pageId: string;

  @IsOptional()
  @IsString()
  instagramAccountId?: string | null;
}
