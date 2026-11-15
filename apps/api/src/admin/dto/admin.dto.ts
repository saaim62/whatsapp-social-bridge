import { IsBoolean, IsNumber, IsString, MinLength } from 'class-validator';

export class ExtendTrialDto {
  @IsNumber()
  days: number;
}

export class SetPaidDto {
  @IsBoolean()
  isPaid: boolean;
}

export class UpdateStorageLimitDto {
  @IsNumber()
  storageLimitBytes: number;
}

export class SetRoleDto {
  @IsString()
  @MinLength(1)
  userId: string;

  @IsString()
  @MinLength(1)
  role: string;
}
