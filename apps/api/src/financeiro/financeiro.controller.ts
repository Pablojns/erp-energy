import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import {
  CobrarNfDto,
  CobrancaPreviewDto,
  CriarDespesaDto,
  EnviarCobrancaDto,
  FinanceiroPeriodQueryDto,
  InterExtratoQueryDto,
  NfsEmAbertoQueryDto,
  NotasAbertasQueryDto,
  PagarNfDto,
} from './dto/financeiro.dto';
import { FinanceiroService } from './financeiro.service';
import { InterIntegrationService } from './inter-integration.service';
import { NotasAbertasService } from './notas-abertas.service';

const XLSX_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 },
});
const CSV_UPLOAD = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024 },
});

@Controller('api/financeiro')
@UseGuards(JwtGuard)
@RequirePermission('financeiro', 'ver_modulo')
export class FinanceiroController {
  constructor(
    private readonly financeiro: FinanceiroService,
    private readonly notasAbertas: NotasAbertasService,
    private readonly inter: InterIntegrationService,
  ) {}

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

  @Get('notas-abertas')
  notasEmAberto(@Query() query: NotasAbertasQueryDto) {
    const historico =
      query.historico === '1' || query.historico === 'true';
    return this.notasAbertas.list({ includeLegado: historico });
  }

  @Post('notas-abertas/importar-weg')
  @RequirePermission('financeiro', 'editar')
  @UseInterceptors(XLSX_UPLOAD)
  importarWegPreview(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
  ) {
    const buffer = this.requireXlsx(file);
    return this.notasAbertas.previewImport(buffer);
  }

  @Post('notas-abertas/importar-weg/confirmar')
  @RequirePermission('financeiro', 'editar')
  @UseInterceptors(XLSX_UPLOAD)
  importarWegAplicar(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
  ) {
    const buffer = this.requireXlsx(file);
    return this.notasAbertas.applyImport(buffer);
  }

  @Patch('notas-abertas/:invoiceDigits/confirmar-pago')
  @RequirePermission('financeiro', 'editar')
  confirmarPago(
    @Param('invoiceDigits') invoiceDigits: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notasAbertas.confirmarPago(invoiceDigits, user.id);
  }

  @Post('notas-abertas/importar-extrato')
  @RequirePermission('financeiro', 'editar')
  @UseInterceptors(CSV_UPLOAD)
  importarExtratoPreview(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
  ) {
    const buffer = this.requireCsv(file);
    return this.notasAbertas.previewExtrato(buffer);
  }

  @Post('notas-abertas/importar-extrato/confirmar')
  @RequirePermission('financeiro', 'editar')
  @UseInterceptors(CSV_UPLOAD)
  importarExtratoAplicar(
    @UploadedFile() file: { originalname?: string; buffer?: Buffer } | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    const buffer = this.requireCsv(file);
    return this.notasAbertas.applyExtrato(buffer, user.id);
  }

  @Get('inter/status')
  interStatus() {
    return this.inter.status();
  }

  @Post('inter/token')
  @RequirePermission('financeiro', 'editar')
  interEnsureToken() {
    return this.inter.ensureToken().then((s) => ({
      ok: true,
      expiresAt: s.expiresAt.toISOString(),
      scope: s.scope,
    }));
  }

  @Get('inter/saldo')
  @RequirePermission('financeiro', 'editar')
  interSaldo(@Query() query: InterExtratoQueryDto) {
    const data = query.dataFim ? new Date(`${query.dataFim}T12:00:00.000Z`) : undefined;
    return this.inter.getSaldo(data);
  }

  @Get('inter/extrato')
  @RequirePermission('financeiro', 'editar')
  async interExtrato(@Query() query: InterExtratoQueryDto) {
    const { inicio, fim } = this.requireInterPeriod(query);
    const fetched = await this.inter.fetchExtratoCredits(inicio, fim);
    return {
      path: fetched.path,
      rawTransactionCount: fetched.rawTransactionCount,
      creditCount: fetched.credits.length,
      chunks: fetched.chunks,
      credits: fetched.credits.map((c) => ({
        date: c.date.toISOString(),
        amount: c.amount,
        counterparty: c.counterparty,
        historico: c.historico,
        source: c.source,
        externalId: c.externalId,
      })),
    };
  }

  @Post('notas-abertas/importar-extrato-api')
  @RequirePermission('financeiro', 'editar')
  importarExtratoApiPreview(@Body() body: InterExtratoQueryDto) {
    const { inicio, fim } = this.requireInterPeriod(body);
    return this.notasAbertas.previewExtratoApi(inicio, fim);
  }

  @Post('notas-abertas/importar-extrato-api/confirmar')
  @RequirePermission('financeiro', 'editar')
  importarExtratoApiAplicar(
    @Body() body: InterExtratoQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const { inicio, fim } = this.requireInterPeriod(body);
    return this.notasAbertas.applyExtratoApi(inicio, fim, user.id);
  }

  @Post('notas-abertas/cobranca/preview')
  @RequirePermission('financeiro', 'editar')
  cobrancaPreview(@Body() dto: CobrancaPreviewDto) {
    return this.notasAbertas.previewCobranca(dto.invoiceDigits);
  }

  @Post('notas-abertas/cobranca/enviar')
  @RequirePermission('financeiro', 'editar')
  cobrancaEnviar(
    @Body() dto: EnviarCobrancaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notasAbertas.enviarCobranca({
      invoiceDigits: dto.invoiceDigits,
      to: dto.to,
      assunto: dto.assunto,
      corpo: dto.corpo,
      userId: user.id,
    });
  }

  @Get('notas-abertas/:invoiceDigits/cobrancas')
  listCobrancas(@Param('invoiceDigits') invoiceDigits: string) {
    return this.notasAbertas.listCobrancas(invoiceDigits);
  }

  @Get('contas-atraso')
  contasAtraso() {
    return this.financeiro.getContasEmAtraso();
  }

  @Get('reconciliacao-estoque')
  reconciliacaoEstoque() {
    return this.financeiro.listFinalizeStockGaps();
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

  private requireXlsx(file?: { originalname?: string; buffer?: Buffer }) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório (campo multipart: file).');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('Formato inválido. Envie um arquivo Excel (.xlsx).');
    }
    return new Uint8Array(file.buffer);
  }

  private requireCsv(file?: { originalname?: string; buffer?: Buffer }) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório (campo multipart: file).');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.csv')) {
      throw new BadRequestException('Formato inválido. Envie um arquivo CSV do Inter.');
    }
    return new Uint8Array(file.buffer);
  }

  private requireInterPeriod(query: { dataInicio?: string; dataFim?: string }) {
    const inicioRaw = String(query.dataInicio ?? '').trim();
    const fimRaw = String(query.dataFim ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioRaw) || !/^\d{4}-\d{2}-\d{2}$/.test(fimRaw)) {
      throw new BadRequestException(
        'Informe dataInicio e dataFim no formato YYYY-MM-DD.',
      );
    }
    const inicio = new Date(`${inicioRaw}T12:00:00.000Z`);
    const fim = new Date(`${fimRaw}T12:00:00.000Z`);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (inicio.getTime() > fim.getTime()) {
      throw new BadRequestException('dataInicio deve ser anterior a dataFim.');
    }
    return { inicio, fim };
  }
}
