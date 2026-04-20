import { IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AbsenceType } from '../prisma/client';

export class CreateAbsenceDto {
  @IsString()
  @MinLength(1)
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsEnum(AbsenceType)
  type!: AbsenceType;
}

export class UpdateAbsenceDto {
  @IsEnum(AbsenceType)
  type!: AbsenceType;
}

export class ListAbsencesQuery {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsEnum(AbsenceType)
  @IsOptional()
  type?: AbsenceType;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  departmentId?: string;
}
