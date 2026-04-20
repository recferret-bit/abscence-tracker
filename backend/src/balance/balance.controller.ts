import { Controller, Get, Param, Query } from '@nestjs/common';

import { BalanceService } from './balance.service';

@Controller('employees/:id/balance')
export class BalanceController {
  constructor(private readonly balance: BalanceService) {}

  @Get()
  get(@Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.balance.getForEmployee(id, asOf);
  }
}
