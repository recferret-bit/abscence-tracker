import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, Prisma } from '../prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto';

export interface EmployeeDto {
  id: string;
  name: string;
  departmentId: string;
  department: string;
  manager: string;
  startDate: string;
  vacationQuota: number | null;
  holidayQuota: number | null;
}

const include = { department: true } as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<EmployeeDto[]> {
    const rows = await this.prisma.employee.findMany({
      include,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<EmployeeDto> {
    const e = await this.prisma.employee.findUnique({ where: { id }, include });
    if (!e) throw new NotFoundException('Employee not found');
    return this.toDto(e);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeDto> {
    await this.requireDepartment(dto.departmentId);
    const e = await this.prisma.employee.create({
      data: {
        name: dto.name,
        departmentId: dto.departmentId,
        manager: dto.manager,
        startDate: this.parseDate(dto.startDate),
      },
      include,
    });
    return this.toDto(e);
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const data: Prisma.EmployeeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.manager !== undefined) data.manager = dto.manager;
    if (dto.startDate !== undefined) data.startDate = this.parseDate(dto.startDate);
    if (dto.departmentId !== undefined) {
      await this.requireDepartment(dto.departmentId);
      data.department = { connect: { id: dto.departmentId } };
    }
    if (dto.vacationQuota !== undefined) {
      data.vacationQuota = dto.vacationQuota;
    }
    if (dto.holidayQuota !== undefined) {
      data.holidayQuota = dto.holidayQuota;
    }
    try {
      const e = await this.prisma.employee.update({ where: { id }, data, include });
      return this.toDto(e);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Employee not found');
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.employee.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('Employee not found');
      }
      throw err;
    }
  }

  private async requireDepartment(id: string) {
    const d = await this.prisma.department.findUnique({ where: { id } });
    if (!d) throw new BadRequestException('Department does not exist');
    return d;
  }

  private parseDate(value: string): Date {
    const d = new Date(value + (value.includes('T') ? '' : 'T00:00:00.000Z'));
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return d;
  }

  private toDto(row: Employee & { department: { name: string } }): EmployeeDto {
    return {
      id: row.id,
      name: row.name,
      departmentId: row.departmentId,
      department: row.department.name,
      manager: row.manager,
      startDate: row.startDate.toISOString().slice(0, 10),
      vacationQuota: row.vacationQuota,
      holidayQuota: row.holidayQuota,
    };
  }
}
