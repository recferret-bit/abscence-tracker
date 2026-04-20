import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '../prisma/client';

import { AbsencesService } from './absences.service';
import { CreateAbsenceDto, ListAbsencesQuery, UpdateAbsenceDto } from './dto';
import { Roles } from '../auth/roles.decorator';

@Controller('absences')
export class AbsencesController {
  constructor(private readonly absences: AbsencesService) {}

  @Get()
  list(@Query() query: ListAbsencesQuery) {
    return this.absences.list(query);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateAbsenceDto) {
    return this.absences.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAbsenceDto) {
    return this.absences.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.absences.remove(id);
  }
}
