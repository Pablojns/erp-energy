import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import {
  CobrarNfDto,
  CriarDespesaDto,
  FinanceiroPeriodQueryDto,
  NfsEmAbertoQueryDto,
  PagarNfDto,
} from './dto/financeiro.dto';
import { FinanceiroService } from './financeiro.service';

@Controller('api/financeiro')
@UseGuards(JwtGuard)
@RequirePermission('financeiro', 'ver_modulo')
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Post('sync')
  @RequirePermission('financeiro', 'editar')
  sync() {
    return this.financeiro.syncNFs();
  }

  @Get('dashboard')
  dashboard(@Query() query: FinanceiroPeriodQueryDto) {
    return this.financeiro.getDashboard(query.dataInicio, query.dataFim);
  }

  @Get('nfs-em-aberto')
  nfsEmAberto(@Query() query: NfsEmAbertoQueryDto) {
    const page = query.page ? Number(query.page) : 1;
    const pageSize = query.pageSize ? Number(query.pageSize) : 20;
    return this.financeiro.getNFsEmAberto(page, pageSize);
  }

  @Patch('nfs/:id/pagar')
  @RequirePermission('financeiro', 'editar')
  pagar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PagarNfDto,
  ) {
    return this.financeiro.marcarComoPago(id, dto.dataPagamento);
  }

  @Patch('nfs/:id/cobrar')
  @RequirePermission('financeiro', 'editar')
  cobrar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CobrarNfDto,
  ) {
    return this.financeiro.registrarCobranca(id, dto.observacao);
  }

  @Get('despesas')
  despesas(@Query() query: FinanceiroPeriodQueryDto) {
    return this.financeiro.getDespesas(query.dataInicio, query.dataFim);
  }

  @Post('despesas')
  @RequirePermission('financeiro', 'criar')
  criarDespesa(@Body() dto: CriarDespesaDto) {
    return this.financeiro.criarDespesa(dto);
  }

  @Delete('despesas/:id')
  @RequirePermission('financeiro', 'excluir')
  deletarDespesa(@Param('id', ParseUUIDPipe) id: string) {
    return this.financeiro.deletarDespesa(id);
  }

  @Get('extrato')
  extrato(@Query() query: FinanceiroPeriodQueryDto) {
    return this.financeiro.getExtrato(query.dataInicio, query.dataFim);
  }
}
