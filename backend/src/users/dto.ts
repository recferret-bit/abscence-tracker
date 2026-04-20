import { IsEmail, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;
}

export class UpdatePrefsDto {
  @IsObject()
  prefs!: Record<string, unknown>;
}
