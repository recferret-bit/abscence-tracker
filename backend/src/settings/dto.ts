import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsInt()
  @Min(0)
  @IsOptional()
  vacationQuota?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  holidayQuota?: number;

  // MM-DD
  @IsString()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  @IsOptional()
  carryoverDeadline?: string;
}
