import {
  BadRequestException,
  Body,
  Controller,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { OrderImportService } from './order-import.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { OrderQueryDto } from './dto/order-query.dto';
import { PedidosAttachNfDto } from './dto/pedidos-attach-nf.dto';
import { PedidosUpdateItemDto } from './dto/pedidos-update-item.dto';
import { PedidosUpdateStatusDto } from './dto/pedidos-update-status.dto';
import { NfAutomaticoService } from './nf-automatico.service';
import { NfQueueService } from './nf-queue.service';
import { PedidosService } from './pedidos.service';

@Controller('api/pedidos')
@UseGuards(JwtGuard)
export class PedidosController {
  constructor(
    private readonly orderImportService: OrderImportService,
    private readonly pedidos: PedidosService,
    private readonly nfAutomaticoService: NfAutomaticoService,
    private readonly nfQueueService: NfQueueService,
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
    @Param('numeroPed', ParseIntPipe) numeroPed: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: PedidosUpdateStatusDto,
  ) {
    return this.pedidos.updateStatuses(numeroPed, dto, user.id);
  }

  @Post(':numeroPed/nf')
  attachNf(
    @Param('numeroPed', ParseIntPipe) numeroPed: number,
    @CurrentUser() user: AuthUser,
    @Body() dto: PedidosAttachNfDto,
  ) {
    return this.pedidos.attachNf(numeroPed, dto, user.id);
  }

  @Post(':numeroPed/saida')
  gerarSaida(
    @Param('numeroPed', ParseIntPipe) numeroPed: number,
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
    const numeroPedAsNumber = Number(numeroPed);
    // Busca pedido com itens
    const pedido = await this.pedidos.findByNumeroPed(numeroPedAsNumber);
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
      numeroPedAsNumber,
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
    const pedido = await this.pedidos.findByNumeroPed(Number(numeroPed));
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
      const pedido = await this.pedidos.findByNumeroPed(Number(job.numeroPed));
      if (pedido && !pedido.invoiceNumber) {
        await this.pedidos.attachNf(
          Number(job.numeroPed),
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

  @Get(':numeroPed')
  detalhe(@Param('numeroPed', ParseIntPipe) numeroPed: number) {
    return this.pedidos.findByNumeroPed(numeroPed);
  }

  @Get(':numeroPed/itens')
  itens(@Param('numeroPed', ParseIntPipe) numeroPed: number) {
    return this.pedidos.listItems(numeroPed);
  }

  @Patch(':numeroPed/itens/:seq')
  updateItem(
    @Param('numeroPed', ParseIntPipe) numeroPed: number,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() dto: PedidosUpdateItemDto,
  ) {
    return this.pedidos.updateItem(numeroPed, seq, dto);
  }

  @Post(':numeroPed/separacao/concluir')
  concluir(
    @Param('numeroPed', ParseIntPipe) numeroPed: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.pedidos.concluirSeparacao(numeroPed, user.id);
  }

  @Patch(':numeroPed/separacao/salvar')
  salvarSeparacao(@Param('numeroPed', ParseIntPipe) numeroPed: number) {
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
  async importar(@UploadedFile() file?: { originalname?: string; buffer?: Buffer }) {
    try {
      console.log('[pedidos.importar] arquivo recebido:', {
        originalname: file?.originalname ?? null,
        bufferSize: file?.buffer?.length ?? 0,
      });

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
      return this.pedidos.importarPlanilha(file.buffer);
    } catch (error) {
      console.log('[pedidos.importar] erro completo:', error);
      throw error;
    }
  }
}

