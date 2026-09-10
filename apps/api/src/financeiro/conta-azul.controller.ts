import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { ContaAzulIntegrationService } from './conta-azul-integration.service';

class ContaAzulConnectDto {
  @IsString()
  @MaxLength(2048)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  state?: string;
}

function queryFlagTrue(value?: string): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

@Controller('api/financeiro/conta-azul')
@UseGuards(JwtGuard)
@RequirePermission('financeiro', 'ver_modulo')
export class ContaAzulController {
  constructor(private readonly contaAzul: ContaAzulIntegrationService) {}

  @Get('status')
  status() {
    return this.contaAzul.status();
  }

  @Get('auth-url')
  @RequirePermission('financeiro', 'editar')
  authUrl() {
    return this.contaAzul.getAuthorizationUrl();
  }

  @Post('connect')
  @RequirePermission('financeiro', 'editar')
  connect(@Body() dto: ContaAzulConnectDto) {
    return this.contaAzul.connectWithCode(dto.code, dto.state);
  }

  @Post('connect-test')
  @RequirePermission('financeiro', 'editar')
  connectTest() {
    return this.contaAzul.connectWithTestUser();
  }

  @Get('categorias')
  categorias() {
    return this.contaAzul.getCategorias();
  }

  @Get('probe')
  @RequirePermission('financeiro', 'editar')
  probe() {
    return this.contaAzul.probeTestAccount();
  }

  @Post('sync')
  @RequirePermission('financeiro', 'editar')
  sync() {
    return this.contaAzul.startSyncJob();
  }

  @Get('sync-status/:jobId')
  @RequirePermission('financeiro', 'editar')
  syncStatus(@Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.contaAzul.getSyncJob(jobId);
  }

  @Post('probe-emissao')
  @RequirePermission('financeiro', 'editar')
  probeEmissao() {
    return this.contaAzul.probeSaleAndInvoiceEmission();
  }

  @Get('reconciliar')
  @RequirePermission('financeiro', 'editar')
  reconciliar(@Query('days') days?: string) {
    const n = days ? Number(days) : 90;
    return this.contaAzul.reconcileTestInvoices(
      Number.isFinite(n) ? n : 90,
    );
  }

  @Post('sincronizar-cadastros')
  @RequirePermission('financeiro', 'editar')
  sincronizarCadastros(
    @Query('dry-run') dryRun?: string,
    @Query('apply') apply?: string,
  ) {
    const wantsDryRun = queryFlagTrue(dryRun);
    const wantsApply = queryFlagTrue(apply);
    const applyNow = wantsApply && !wantsDryRun;
    return this.contaAzul.sincronizarCadastros({ apply: applyNow });
  }

  @Post('sincronizar-vendas')
  @RequirePermission('financeiro', 'editar')
  sincronizarVendas(
    @Query('dry-run') dryRun?: string,
    @Query('apply') apply?: string,
  ) {
    const wantsDryRun = queryFlagTrue(dryRun);
    const wantsApply = queryFlagTrue(apply);
    const applyNow = wantsApply && !wantsDryRun;
    return this.contaAzul.sincronizarVendas({ apply: applyNow });
  }
}
