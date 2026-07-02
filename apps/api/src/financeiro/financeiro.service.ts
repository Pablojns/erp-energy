import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import type { CriarDespesaDto } from './dto/financeiro.dto';

const NF_STATUS = {
  ABERTO: 'ABERTO',
  PAGO: 'PAGO',
  ATRASADO: 'ATRASADO',
} as const;

const DIAS_ATRASO_LIMITE = 12;
const CONTA_AZUL_FATURADO = 'Faturado';

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value.toString());
}

function parseYmdOrThrow(raw: string, label: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) {
    throw new BadRequestException(`${label} inválida. Use o formato YYYY-MM-DD.`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function endOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function diasEmAberto(dataEmissao: Date, ref: Date = new Date()): number {
  const start = startOfUtcDay(dataEmissao).getTime();
  const end = startOfUtcDay(ref).getTime();
  return Math.max(0, Math.floor((end - start) / (24 * 60 * 60 * 1000)));
}

function computeStatus(
  dataEmissao: Date,
  dataPagamento: Date | null,
  ref: Date = new Date(),
): string {
  if (dataPagamento) {
    return NF_STATUS.PAGO;
  }
  if (diasEmAberto(dataEmissao, ref) > DIAS_ATRASO_LIMITE) {
    return NF_STATUS.ATRASADO;
  }
  return NF_STATUS.ABERTO;
}

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  async syncNFs(): Promise<{ synced: number }> {
    const orders = await this.prisma.client.order.findMany({
      where: {
        AND: [
          { invoiceNumber: { not: null } },
          { NOT: { invoiceNumber: '' } },
        ],
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalValue: true,
        updatedAt: true,
        invoicedAt: true,
      },
    });

    let synced = 0;
    for (const order of orders) {
      const invoiceNumber = order.invoiceNumber?.trim();
      if (!invoiceNumber) continue;

      const dataEmissao = order.invoicedAt ?? order.updatedAt;
      const existing = await this.prisma.client.financeiroNF.findUnique({
        where: { orderId: order.id },
      });

      const dataPagamento = existing?.dataPagamento ?? null;
      const observacao = existing?.observacao ?? null;
      const status = computeStatus(dataEmissao, dataPagamento);

      await this.prisma.client.financeiroNF.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          invoiceNumber,
          valor: order.totalValue,
          dataEmissao,
          dataPagamento,
          observacao,
          status,
        },
        update: {
          invoiceNumber,
          valor: order.totalValue,
          dataEmissao,
          status,
        },
      });
      synced += 1;
    }

    return { synced };
  }

  async getDashboard(dataInicio?: string, dataFim?: string) {
    const range = this.parseOptionalRange(dataInicio, dataFim);
    const nfPeriodWhere: Prisma.FinanceiroNFWhereInput = range
      ? { dataEmissao: { gte: range.start, lte: range.end } }
      : {};
    const pagoPeriodWhere: Prisma.FinanceiroNFWhereInput = range
      ? {
          status: NF_STATUS.PAGO,
          dataPagamento: { gte: range.start, lte: range.end },
        }
      : { status: NF_STATUS.PAGO };
    const despesaPeriodWhere: Prisma.DespesaWhereInput = range
      ? { data: { gte: range.start, lte: range.end } }
      : {};

    const periodWhere: Prisma.OrderWhereInput = range
      ? { orderDate: { gte: range.start, lte: range.end } }
      : {};
    const faturadoWhere: Prisma.OrderWhereInput = {
      contaAzulStatus: CONTA_AZUL_FATURADO,
    };
    const faturadoPeriodWhere: Prisma.OrderWhereInput = range
      ? { AND: [periodWhere, faturadoWhere] }
      : faturadoWhere;

    const [
      faturamentoAgg,
      valorPedidosPeriodoAgg,
      valorFaturadoPeriodoAgg,
      valorPedidosHistoricoAgg,
      valorFaturadoHistoricoAgg,
      emAbertoAgg,
      atrasadoAgg,
      pagoAgg,
      despesasAgg,
    ] = await Promise.all([
      this.prisma.client.financeiroNF.aggregate({
        where: nfPeriodWhere,
        _sum: { valor: true },
      }),
      this.prisma.client.order.aggregate({
        where: periodWhere,
        _sum: { totalValue: true },
      }),
      this.prisma.client.order.aggregate({
        where: faturadoPeriodWhere,
        _sum: { totalValue: true },
      }),
      this.prisma.client.order.aggregate({
        _sum: { totalValue: true },
      }),
      this.prisma.client.order.aggregate({
        where: faturadoWhere,
        _sum: { totalValue: true },
      }),
      this.prisma.client.financeiroNF.aggregate({
        where: { status: NF_STATUS.ABERTO },
        _sum: { valor: true },
      }),
      this.prisma.client.financeiroNF.aggregate({
        where: { status: NF_STATUS.ATRASADO },
        _sum: { valor: true },
      }),
      this.prisma.client.financeiroNF.aggregate({
        where: pagoPeriodWhere,
        _sum: { valor: true },
      }),
      this.prisma.client.despesa.aggregate({
        where: despesaPeriodWhere,
        _sum: { valor: true },
      }),
    ]);

    const faturamentoMes = decimalToNumber(faturamentoAgg._sum.valor);
    const totalPago = decimalToNumber(pagoAgg._sum.valor);
    const despesasMes = decimalToNumber(despesasAgg._sum.valor);

    return {
      faturamentoMes,
      valorPedidosPeriodo: decimalToNumber(valorPedidosPeriodoAgg._sum.totalValue),
      valorFaturadoPeriodo: decimalToNumber(valorFaturadoPeriodoAgg._sum.totalValue),
      valorPedidosHistorico: decimalToNumber(valorPedidosHistoricoAgg._sum.totalValue),
      valorFaturadoHistorico: decimalToNumber(valorFaturadoHistoricoAgg._sum.totalValue),
      totalEmAberto: decimalToNumber(emAbertoAgg._sum.valor),
      totalAtrasado: decimalToNumber(atrasadoAgg._sum.valor),
      totalPago,
      despesasMes,
      lucroBruto: totalPago - despesasMes,
    };
  }

  async getNFsEmAberto(page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const rows = await this.prisma.client.financeiroNF.findMany({
      where: {
        status: { in: [NF_STATUS.ABERTO, NF_STATUS.ATRASADO] },
      },
      include: {
        order: {
          select: {
            id: true,
            code: true,
            externalOrderNumber: true,
            receiverName: true,
            customerName: true,
          },
        },
      },
    });

    const mapped = rows
      .map((nf) => ({
        id: nf.id,
        invoiceNumber: nf.invoiceNumber,
        pedido: nf.order.externalOrderNumber ?? nf.order.code,
        recebedor: nf.order.receiverName ?? nf.order.customerName,
        valor: decimalToNumber(nf.valor),
        dataEmissao: nf.dataEmissao.toISOString(),
        diasEmAberto: diasEmAberto(nf.dataEmissao),
        status: nf.status,
        observacao: nf.observacao,
      }))
      .sort((a, b) => b.diasEmAberto - a.diasEmAberto);

    const total = mapped.length;
    const start = (safePage - 1) * safePageSize;
    const data = mapped.slice(start, start + safePageSize);

    return {
      data,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / safePageSize)),
      },
    };
  }

  async marcarComoPago(nfId: string, dataPagamentoRaw: string) {
    const dataPagamento = parseYmdOrThrow(dataPagamentoRaw, 'dataPagamento');
    const nf = await this.prisma.client.financeiroNF.findUnique({
      where: { id: nfId },
    });
    if (!nf) {
      throw new NotFoundException('NF financeira não encontrada.');
    }

    return this.prisma.client.financeiroNF.update({
      where: { id: nfId },
      data: {
        dataPagamento,
        status: NF_STATUS.PAGO,
      },
    });
  }

  async registrarCobranca(nfId: string, observacao: string) {
    const nf = await this.prisma.client.financeiroNF.findUnique({
      where: { id: nfId },
    });
    if (!nf) {
      throw new NotFoundException('NF financeira não encontrada.');
    }

    const trimmed = observacao.trim();
    if (!trimmed) {
      throw new BadRequestException('Observação é obrigatória.');
    }

    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const merged = nf.observacao
      ? `${nf.observacao}\n[${stamp}] ${trimmed}`
      : `[${stamp}] ${trimmed}`;

    return this.prisma.client.financeiroNF.update({
      where: { id: nfId },
      data: { observacao: merged },
    });
  }

  async getDespesas(dataInicio?: string, dataFim?: string) {
    const range = this.parseOptionalRange(dataInicio, dataFim);

    const rows = await this.prisma.client.despesa.findMany({
      where: range ? { data: { gte: range.start, lte: range.end } } : {},
      orderBy: { data: 'desc' },
    });

    return rows.map((d) => ({
      id: d.id,
      descricao: d.descricao,
      categoria: d.categoria,
      valor: decimalToNumber(d.valor),
      data: d.data.toISOString(),
      fornecedor: d.fornecedor,
      observacao: d.observacao,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async criarDespesa(dto: CriarDespesaDto) {
    const valor = Number(dto.valor.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new BadRequestException('Valor inválido.');
    }

    const data = parseYmdOrThrow(dto.data, 'data');

    const created = await this.prisma.client.despesa.create({
      data: {
        descricao: dto.descricao.trim(),
        categoria: dto.categoria,
        valor,
        data,
        fornecedor: dto.fornecedor?.trim() || null,
        observacao: dto.observacao?.trim() || null,
      },
    });

    return {
      id: created.id,
      descricao: created.descricao,
      categoria: created.categoria,
      valor: decimalToNumber(created.valor),
      data: created.data.toISOString(),
      fornecedor: created.fornecedor,
      observacao: created.observacao,
    };
  }

  async deletarDespesa(id: string) {
    try {
      await this.prisma.client.despesa.delete({ where: { id } });
    } catch {
      throw new NotFoundException('Despesa não encontrada.');
    }
    return { ok: true };
  }

  async getExtrato(dataInicio?: string, dataFim?: string) {
    const range = this.parseOptionalRange(dataInicio, dataFim);
    const nfWhere: Prisma.FinanceiroNFWhereInput = range
      ? {
          status: NF_STATUS.PAGO,
          dataPagamento: { gte: range.start, lte: range.end },
        }
      : { status: NF_STATUS.PAGO };
    const despesaWhere: Prisma.DespesaWhereInput = range
      ? { data: { gte: range.start, lte: range.end } }
      : {};

    const [entradas, saidas] = await Promise.all([
      this.prisma.client.financeiroNF.findMany({
        where: nfWhere,
        include: {
          order: {
            select: {
              code: true,
              externalOrderNumber: true,
            },
          },
        },
      }),
      this.prisma.client.despesa.findMany({
        where: despesaWhere,
      }),
    ]);

    type ExtratoItem = {
      id: string;
      tipo: 'ENTRADA' | 'SAIDA';
      descricao: string;
      valor: number;
      data: string;
      referencia?: string;
    };

    const items: ExtratoItem[] = [
      ...entradas.map((nf) => ({
        id: nf.id,
        tipo: 'ENTRADA' as const,
        descricao: `NF ${nf.invoiceNumber}`,
        valor: decimalToNumber(nf.valor),
        data: (nf.dataPagamento ?? nf.dataEmissao).toISOString(),
        referencia: nf.order.externalOrderNumber ?? nf.order.code,
      })),
      ...saidas.map((d) => ({
        id: d.id,
        tipo: 'SAIDA' as const,
        descricao: d.descricao,
        valor: decimalToNumber(d.valor),
        data: d.data.toISOString(),
        referencia: d.categoria,
      })),
    ];

    items.sort(
      (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime(),
    );

    const totalEntradas = items
      .filter((i) => i.tipo === 'ENTRADA')
      .reduce((acc, i) => acc + i.valor, 0);
    const totalSaidas = items
      .filter((i) => i.tipo === 'SAIDA')
      .reduce((acc, i) => acc + i.valor, 0);

    return {
      items,
      totalEntradas,
      totalSaidas,
      saldo: totalEntradas - totalSaidas,
    };
  }

  async listNfsAtrasadas() {
    return this.prisma.client.financeiroNF.findMany({
      where: { status: NF_STATUS.ATRASADO },
      include: {
        order: {
          select: {
            externalOrderNumber: true,
            code: true,
          },
        },
      },
    });
  }

  private normalizeDateParam(value?: string): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  /** Retorna null quando nenhum filtro de período foi informado (opção "Todos"). */
  private parseOptionalRange(
    dataInicio?: string,
    dataFim?: string,
  ): { start: Date; end: Date } | null {
    const inicio = this.normalizeDateParam(dataInicio);
    const fim = this.normalizeDateParam(dataFim);
    if (!inicio || !fim) {
      return null;
    }

    const start = startOfUtcDay(parseYmdOrThrow(inicio, 'dataInicio'));
    const end = endOfUtcDay(parseYmdOrThrow(fim, 'dataFim'));

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('dataInicio não pode ser posterior a dataFim.');
    }

    return { start, end };
  }
}
