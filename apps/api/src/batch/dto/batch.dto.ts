import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class IdsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}

export class PublishBulkDto extends IdsDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ApproveBatchDto {
  @IsOptional()
  @IsString()
  instagramCaption?: string;

  @IsOptional()
  @IsString()
  facebookCaption?: string;

  @IsOptional()
  @IsString()
  storyText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class PublishBatchDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targets?: string[];

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ReorderMediaDto {
  @IsArray()
  @IsString({ each: true })
  orderedMediaIds: string[];
}

export class MaskBoxDto {
  @IsNumber()
  left: number;

  @IsNumber()
  top: number;

  @IsNumber()
  width: number;

  @IsNumber()
  height: number;
}

export class MaskMediaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaskBoxDto)
  boxes: MaskBoxDto[];
}

export class MoveMediaDto {
  @IsString()
  targetBatchId: string;

  @IsOptional()
  @IsBoolean()
  retainAI?: boolean;
}

export class SendBulkDto {
  @IsArray()
  @IsString({ each: true })
  batchIds: string[];

  @IsArray()
  @IsString({ each: true })
  targetEmails: string[];
}

export class SendBatchDto {
  @IsArray()
  @IsString({ each: true })
  targetEmails: string[];
}

export class RenameBatchDto {
  @IsString()
  name: string;
}

export class SetPriceDto {
  @IsNumber()
  price: number;
}
