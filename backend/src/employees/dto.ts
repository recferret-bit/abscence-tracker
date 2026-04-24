import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  departmentId!: string;

  @IsString()
  @MinLength(1)
  manager!: string;

  // YYYY-MM-DD
  @IsDateString()
  startDate!: string;
}

export class UpdateEmployeeDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  departmentId?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  manager?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  /** Omit or set to null to use global AppSettings default */
  @IsOptional()
  @IsInt()
  @Min(0)
  vacationQuota?: number | null;

  /** Omit or set to null to use global AppSettings default */
  @IsOptional()
  @IsInt()
  @Min(0)
  holidayQuota?: number | null;

  @IsOptional()
  @IsNumber()
  vacationAdjustment?: number;

  @IsOptional()
  @IsNumber()
  holidayAdjustment?: number;
}
