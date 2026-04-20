import { Injectable } from '@nestjs/common';
import { AppSettings } from '../prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AppSettings> {
    return this.prisma.appSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });
  }

  async update(dto: UpdateSettingsDto): Promise<AppSettings> {
    return this.prisma.appSettings.upsert({
      where: { id: 1 },
      update: dto,
      create: { id: 1, ...dto },
    });
  }
}
