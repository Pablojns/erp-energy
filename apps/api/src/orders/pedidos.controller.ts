import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  ParseUUIDPipe,
  InternalServerErrorException,
  NotFoundException,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { OrderImportService } from './order-import.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { OrderQueryDto } from './dto/order-query.dto';
import { CreateManualPedidoDto } from './dto/create-manual-pedido.dto';
import { CreateSitePedidoDto } from './dto/create-site-pedido.dto';
import { CreateVendaExternaPedidoDto } from './dto/create-venda-externa-pedido.dto';
import { PedidosAttachNfDto } from './dto/pedidos-attach-nf.dto';
import { PedidosUpdateItemDto } from './dto/pedidos-update-item.dto';
import { PedidosUpdateStatusDto } from './dto/pedidos-update-status.dto';
import { UpdateOrderPriorityDto } from './dto/update-order-priority.dto';
import { UpdateOrderCarrierDto } from './dto/update-order-carrier.dto';
import { UpdatePedidoAdminDto } from './dto/update-pedido-admin.dto';
import { UpdatePedidoVolumesDto } from './dto/update-pedido-volumes.dto';
import { GenerateRomaneioDto } from './dto/generate-romaneio.dto';
import { NfAutomaticoService } from './nf-automatico.service';
import { NfQueueService } from './nf-queue.service';
import { PedidosService } from './pedidos.service';
import { PedidosEtiquetaService } from './pedidos-etiqueta.service';
import { AuditService } from '../common/audit.service';
import { RequirePermission } from '../common/permissions/require-permission.decorator';

@Controller('api/pedidos')
@UseGuards(JwtGuard)
export class PedidosController {
  constructor(
    private readonly orderImportService: OrderImportService,
    private readonly pedidos: PedidosService,
    private readonly pedidosEtiqueta: PedidosEtiquetaService,
    private readonly nfAutomaticoService: NfAutomaticoService,
    private readonly nfQueueService: NfQueueService,
    private readonly audit: AuditService,
  ) {}

  /**
   * GET /api/pedidos
   * Reusa o mesmo contrato de filtros do módulo de pedidos (`OrderQueryDto`).
   */
  @Get()
  list(@Query() query: OrderQueryDto) {
    // Mantém compatibilidade com filtros já existentes (status, data, recebedor, ponto etc.)
    // Para filtros específicos da planilha: use `externalOrderNumber`, `receiverName`, `unloadingPoint`.
    // Controller de "pedidos" é apenas um alias REST.
    return this.pedidos.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('expedicao', 'criar_pedido')
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualPedidoDto,
  ) {
    return this.pedidos.createManual(user.id, dto);
  }

  @Post('site')
  @HttpCode(HttpStatus.CREATED)
  createSite(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSitePedidoDto,
  ) {
    return this.pedidos.createPedidoSite(user.id, dto);
  }

  @Post('venda-externa')
  @HttpCode(HttpStatus.CREATED)
  createVendaExterna(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVendaExternaPedidoDto,
  ) {
    return this.pedidos.createVendaExterna(user.id, dto);
  }

  @Post('romaneio')
  async gerarRomaneio(
    @Body() dto: GenerateRomaneioDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.pedidos.gerarRomaneioPdf(dto.orderIds);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="romaneio-coleta.pdf"',
    });
    return new StreamableFile(buffer);
  }

  @Patch(':numeroPed')
  @RequirePermission('expedicao', 'editar_pedido')
  updateManual(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateManualPedidoDto,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem editar pedidos.',
      );
    }
    return this.pedidos.updateManual(user.id, numeroPed, dto);
  }

  @Patch(':numeroPed/admin')
  updateAdmin(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePedidoAdminDto,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem editar pedidos.',
      );
    }
    return this.pedidos.updateAdmin(user.id, numeroPed, dto);
  }

  @Delete('lgpd/titular/:documento')
  @HttpCode(HttpStatus.OK)
  async excluirDadosTitular(
    @Param('documento') documento: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Apenas administradores podem executar exclusão LGPD.');
    }
    return this.pedidos.excluirDadosTitular(documento, user.id);
  }

  @Delete('saidas/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expedicao', 'confirmar_saida')
  deleteSaida(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pedidos.deleteSaida(user.id, id);
  }

  @Delete(':numeroPed')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('expedicao', 'deletar_pedido')
  deleteManual(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Apenas administradores podem excluir pedidos.',
      );
    }
    return this.pedidos.deleteManual(
      user.id,
      decodeURIComponent(numeroPed).replace(/^#/, ''),
    );
  }

  @Get('fila')
  fila() {
    return this.pedidos.filaSeparacao();
  }

  @Get('saidas')
  listSaidas(
    @Query('search') search?: string,
    @Query('period') period?: 'all' | 'today' | 'week' | 'month',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.pedidos.listSaidas({
      search,
      period,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('saidas/:id')
  detalheSaida(@Param('id', ParseUUIDPipe) id: string) {
    return this.pedidos.findSaidaById(id);
  }

  @Get('transportadoras')
  async getTransportadoras() {
    return this.nfAutomaticoService.listarTransportadoras();
  }

  @Patch(':numeroPed/status')
  updateStatus(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PedidosUpdateStatusDto,
  ) {
    return this.pedidos.updateStatuses(numeroPed, dto, user.id);
  }

  @Patch(':numeroPed/priority')
  updatePriority(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderPriorityDto,
  ) {
    return this.pedidos.updatePriority(numeroPed, dto, user.id);
  }

  @Patch(':numeroPed/carrier')
  updateCarrier(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderCarrierDto,
  ) {
    return this.pedidos.updateCarrier(
      numeroPed,
      dto.carrierId ?? null,
      user.id,
    );
  }

  @Patch(':numeroPed/volumes')
  updateVolumes(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePedidoVolumesDto,
  ) {
    if (!user.roles.includes('ADMIN') && !user.roles.includes('OPERADOR')) {
      throw new ForbiddenException(
        'Apenas administradores e operadores podem editar volumes.',
      );
    }
    return this.pedidos.updateVolumes(numeroPed, dto.volumes, user.id);
  }

  @Patch(':numeroPed/rastreio')
  updateRastreio(
    @Param('numeroPed') numeroPed: string,
    @Body() dto: { trackingCode: string },
  ) {
    return this.pedidos.updateRastreio(numeroPed, dto.trackingCode ?? '');
  }

  @Post(':numeroPed/nf')
  @RequirePermission('expedicao', 'emitir_nf')
  attachNf(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PedidosAttachNfDto,
  ) {
    return this.pedidos.attachNf(numeroPed, dto, user.id);
  }

  @Post(':numeroPed/saida')
  @RequirePermission('expedicao', 'confirmar_saida')
  gerarSaida(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PedidosAttachNfDto,
  ) {
    return this.pedidos.gerarSaidaComNf(numeroPed, dto, user.id);
  }

  @Post(':numeroPed/gerar-nf-automatico')
  async gerarNfAutomatico(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { volume?: string; transportadora?: string },
  ) {
    const pedido = await this.pedidos.findByNumeroPed(numeroPed);
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const resultado = await this.nfAutomaticoService.emitirNfPedido(numeroPed, {
      volume: body.volume,
      transportadora: body.transportadora,
      pedidoCompleto: pedido,
    });

    if (!resultado.ok) {
      throw new InternalServerErrorException(
        `Erro ao emitir NF: ${resultado.erro}`,
      );
    }

    await this.pedidos.attachNf(
      numeroPed,
      {
        invoiceNumber: resultado.numeroNota,
        invoiceValue: pedido.totalValue,
        exitDate: new Date().toISOString(),
      },
      user.id,
    );

    return {
      success: true,
      numeroPed,
      numeroNota: resultado.numeroNota,
      message: `NF-e ${resultado.numeroNota} gerada e atrelada ao pedido`,
    };
  }

  @Post(':numeroPed/gerar-nf-fila')
  async adicionarNfNaFila(
    @Param('numeroPed') numeroPed: string,
    @Body() body: { volume?: string; transportadora?: string },
  ) {
    const pedido = await this.pedidos.findByNumeroPed(numeroPed);
    if (!pedido) throw new NotFoundException('Pedido não encontrado');

    const job = this.nfQueueService.adicionarNaFila(numeroPed, pedido, {
      volume: body.volume,
      transportadora: body.transportadora,
    });
    const aguardando = this.nfQueueService
      .listarJobs()
      .filter((j) => j.status === 'aguardando');
    const posicaoNaFila =
      aguardando.findIndex((j) => j.id === job.id) >= 0
        ? aguardando.findIndex((j) => j.id === job.id) + 1
        : 1;

    return {
      jobId: job.id,
      status: job.status,
      posicaoNaFila,
      message: 'Pedido adicionado à fila de emissão',
    };
  }

  @Get('nf-fila/:jobId')
  async statusJob(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthUser,
  ) {
    const job = this.nfQueueService.buscarJob(jobId);
    if (!job) throw new NotFoundException('Job não encontrado');

    if (job.status === 'concluido' && job.numeroNota) {
      const pedido = await this.pedidos.findByNumeroPed(job.numeroPed);
      if (pedido && !pedido.invoiceNumber) {
        await this.pedidos.attachNf(
          job.numeroPed,
          {
            invoiceNumber: job.numeroNota,
            invoiceValue: pedido.totalValue,
            exitDate: (job.concluidoEm ?? new Date()).toISOString(),
          },
          user.id,
        );
      }
    }

    return job;
  }

  @Get('nf-fila')
  async listarFila() {
    return this.nfQueueService.listarJobs();
  }

  @Get(':numeroPed/etiqueta')
  async etiqueta(
    @Param('numeroPed') numeroPed: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.pedidosEtiqueta.generatePdf(numeroPed);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="etiqueta-${filename}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':numeroPed/etiqueta-correios')
  async etiquetaCorreios(
    @Param('numeroPed') numeroPed: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.pedidos.gerarEtiquetaCorreios(numeroPed);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="etiqueta-${filename}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Delete(':numeroPed/etiqueta-correios')
  @HttpCode(HttpStatus.OK)
  cancelarEtiquetaCorreios(@Param('numeroPed') numeroPed: string) {
    return this.pedidos.cancelarEtiquetaCorreios(numeroPed);
  }

  @Get(':numeroPed')
  async detalhe(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const result = await this.pedidos.findByNumeroPed(numeroPed);
    await this.audit.logDataAccess(
      user.id,
      'Order',
      numeroPed,
      'DATA_ACCESS',
      req.ip,
    );
    return result;
  }

  @Get(':numeroPed/itens')
  async itens(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    const result = await this.pedidos.listItems(numeroPed);
    await this.audit.logDataAccess(
      user.id,
      'OrderItem',
      numeroPed,
      'DATA_ACCESS',
      req.ip,
    );
    return result;
  }

  @Patch(':numeroPed/itens/:seq')
  updateItem(
    @Param('numeroPed') numeroPed: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() dto: PedidosUpdateItemDto,
  ) {
    return this.pedidos.updateItem(numeroPed, seq, dto);
  }

  @Post(':numeroPed/separacao/concluir')
  @RequirePermission('expedicao', 'concluir_separacao')
  concluir(
    @Param('numeroPed') numeroPed: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pedidos.concluirSeparacao(numeroPed, user.id);
  }

  @Patch(':numeroPed/separacao/salvar')
  salvarSeparacao(@Param('numeroPed') numeroPed: string) {
    return this.pedidos.salvarSeparacao(numeroPed);
  }

  @Post('importar-agora')
  @HttpCode(HttpStatus.OK)
  async importarAgora() {
    await this.orderImportService.importarAgora();
    return { ok: true, message: 'Importação iniciada com sucesso.' };
  }
  @Post('importar')
  @UseGuards()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async importar(
    @UploadedFile() file?: { originalname?: string; buffer?: Buffer },
    @Query('reset') reset?: string,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo obrigatório (campo multipart: file).');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) {
      throw new BadRequestException('Formato inválido. Envie .xlsx ou .csv.');
    }
    if (name.endsWith('.csv')) {
      throw new BadRequestException('CSV ainda não suportado. Envie .xlsx.');
    }
    const shouldReset = reset === 'true' || reset === '1';
    return this.pedidos.importarPlanilha(file.buffer, { reset: shouldReset });
  }
}

