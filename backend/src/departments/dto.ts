import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateDepartmentDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;
}
