import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '../prisma/client';

import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  @Roles(Role.ADMIN)
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
