import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, Role } from '../prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

const publicSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  prefs: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ select: publicSelect, orderBy: { createdAt: 'asc' } });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: dto.role ?? Role.VIEWER,
      },
      select: publicSelect,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.requireUser(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.update({ where: { id }, data, select: publicSelect });
  }

  async remove(id: string) {
    await this.requireUser(id);
    await this.prisma.user.delete({ where: { id } });
  }

  updatePrefs(id: string, prefs: Record<string, unknown>) {
    return this.prisma.user.update({
      where: { id },
      data: { prefs: prefs as object },
      select: publicSelect,
    });
  }

  private async requireUser(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }
}
