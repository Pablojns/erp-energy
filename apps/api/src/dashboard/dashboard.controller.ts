import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { ContaAzulIntegrationService } from '../financeiro/conta-azul-integration.service';
import { DashboardService } from './dashboard.service';

@Controller('api/erp/dashboard')
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly contaAzul: ContaAzulIntegrationService,
  ) {}

  @Get('resumo')
  @RequirePermission('dashboard', 'ver_modulo')
  resumo(
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
  ) {
    return this.dashboard.getResumo(dataInicio, dataFim);
  }

  @Get('calendario')
  @RequirePermission('dashboard', 'ver_modulo')
  async calendario(
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? Number(year) : now.getUTCFullYear();
    const m = month ? Number(month) : now.getUTCMonth() + 1;
    const cal = await this.contaAzul.getCalendarioMes(
      Number.isFinite(y) ? y : now.getUTCFullYear(),
      Number.isFinite(m) ? m : now.getUTCMonth() + 1,
    );
    return this.dashboard.attachComprasToCalendario(cal);
  }
}
