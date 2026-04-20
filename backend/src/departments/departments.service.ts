import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateDepartmentDto) {
    const exists = await this.prisma.department.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Department already exists');
    return this.prisma.department.create({ data: { name: dto.name } });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.requireDept(id);
    return this.prisma.department.update({
      where: { id },
      data: { name: dto.name },
    });
  }

  async remove(id: string) {
    await this.requireDept(id);
    const employees = await this.prisma.employee.count({ where: { departmentId: id } });
    if (employees > 0) {
      throw new BadRequestException(
        'Cannot delete department with active employees. Reassign them first.',
      );
    }
    await this.prisma.department.delete({ where: { id } });
  }

  private async requireDept(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }
}
