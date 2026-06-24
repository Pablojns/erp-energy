import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { DashboardService } from './dashboard.service';

@Controller('api/erp/dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('resumo')
  @RequirePermission('dashboard', 'ver_dashboard')
  resumo(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashboard.getResumo(dataInicio, dataFim);
  }
}
