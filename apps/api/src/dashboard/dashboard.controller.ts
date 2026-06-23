import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { DashboardService } from './dashboard.service';

@Controller('api/erp/dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('resumo')
  resumo(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashboard.getResumo(dataInicio, dataFim);
  }
}
