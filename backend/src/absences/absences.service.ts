import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Absence, AbsenceType, Prisma } from '../prisma/client';

import { computeBalance } from '../balance/balance.service';
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

    const newDate = this.parseDate(dto.date);
    if (dto.type !== AbsenceType.SICK) {
      const existing = await this.prisma.absence.findMany({
        where: { employeeId: dto.employeeId },
      });
      const prospective = [...existing, { date: newDate, type: dto.type }] as Absence[];
      await this.assertWithinQuota(dto.employeeId, prospective, [newDate]);
    }

    try {
      const a = await this.prisma.absence.create({
        data: {
          employeeId: dto.employeeId,
          date: newDate,
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
    const target = await this.prisma.absence.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Absence not found');

    if (dto.type !== AbsenceType.SICK) {
      const all = await this.prisma.absence.findMany({
        where: { employeeId: target.employeeId },
      });
      const prospective = all.map((a) =>
        a.id === id ? { ...a, type: dto.type } : a,
      );
      await this.assertWithinQuota(target.employeeId, prospective, [target.date]);
    }

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

  private async assertWithinQuota(
    employeeId: string,
    prospective: Array<{ date: Date; type: AbsenceType }>,
    affectedDates: Date[],
  ): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new BadRequestException('Employee does not exist');

    let settings = await this.prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await this.prisma.appSettings.create({ data: { id: 1 } });
    }

    const vacQuota = employee.vacationQuota ?? settings.vacationQuota;
    const holQuota = employee.holidayQuota ?? settings.holidayQuota;

    const todayUtc = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const years = new Set(affectedDates.map((d) => d.getUTCFullYear()));

    for (const Y of years) {
      const datesInYear = affectedDates.filter((d) => d.getUTCFullYear() === Y);
      const latestInYear = new Date(Math.max(...datesInYear.map((d) => d.getTime())));
      const asOf = new Date(Math.max(todayUtc.getTime(), latestInYear.getTime()));

      const result = computeBalance({
        startDate: employee.startDate,
        asOf,
        absences: prospective as Absence[],
        vacationQuota: vacQuota,
        holidayQuota: holQuota,
        carryoverDeadline: settings.carryoverDeadline,
      });

      if (result.vacation.balanceToday < 0) {
        throw new BadRequestException(`Vacation quota exceeded for ${Y}`);
      }
      if (result.holiday.balanceToday < 0) {
        throw new BadRequestException(`Holiday quota exceeded for ${Y}`);
      }
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
