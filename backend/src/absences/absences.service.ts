import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Absence, Prisma } from '../prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAbsenceDto,
  ListAbsencesQuery,
  UpdateAbsenceDto,
} from './dto';

export interface AbsenceDto {
  id: string;
  employeeId: string;
  date: string;
  type: Absence['type'];
}

@Injectable()
export class AbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAbsencesQuery): Promise<AbsenceDto[]> {
    const where: Prisma.AbsenceWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.departmentId) {
      where.employee = { departmentId: query.departmentId };
    }
    if (query.from || query.to) {
      where.date = {};
      if (query.from) (where.date as Prisma.DateTimeFilter).gte = this.parseDate(query.from);
      if (query.to) (where.date as Prisma.DateTimeFilter).lte = this.parseDate(query.to);
    }

    const rows = await this.prisma.absence.findMany({
      where,
      orderBy: [{ date: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(dto: CreateAbsenceDto): Promise<AbsenceDto> {
    const emp = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!emp) throw new BadRequestException('Employee does not exist');
    try {
      const a = await this.prisma.absence.create({
        data: {
          employeeId: dto.employeeId,
          date: this.parseDate(dto.date),
          type: dto.type,
        },
      });
      return this.toDto(a);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'Absence already exists for this employee on this date',
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAbsenceDto): Promise<AbsenceDto> {
    try {
      const a = await this.prisma.absence.update({
        where: { id },
        data: { type: dto.type },
      });
      return this.toDto(a);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Absence not found');
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.absence.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Absence not found');
      }
      throw err;
    }
  }

  private parseDate(value: string): Date {
    const d = new Date(value + (value.includes('T') ? '' : 'T00:00:00.000Z'));
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return d;
  }

  private toDto(a: Absence): AbsenceDto {
    return {
      id: a.id,
      employeeId: a.employeeId,
      date: a.date.toISOString().slice(0, 10),
      type: a.type,
    };
  }
}
