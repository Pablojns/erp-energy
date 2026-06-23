import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';

const FLUXO_STATUSES: OrderStatus[] = [
  OrderStatus.NOVO,
  OrderStatus.EM_SEPARACAO,
  OrderStatus.AGUARDANDO_NF,
  OrderStatus.FINALIZADO,
  OrderStatus.PARCIAL,
  OrderStatus.CANCELADO,
];

const DELAYED_EXCLUDED: OrderStatus[] = [
  OrderStatus.FINALIZADO,
  OrderStatus.CANCELADO,
];

const TERMINAL_STATUSES: OrderStatus[] = [
  OrderStatus.FINALIZADO,
  OrderStatus.CANCELADO,
];

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

function currentMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = endOfUtcDay(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)),
  );
  return { start, end };
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getResumo(dataInicio?: string, dataFim?: string) {
    const { start, end } = this.resolveRange(dataInicio, dataFim);
    const periodWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: start, lte: end },
    };
    const finalizedInPeriodWhere: Prisma.OrderWhereInput = {
      AND: [periodWhere, { status: OrderStatus.FINALIZADO }],
    };
    const exitPeriodWhere: Prisma.OrderExitWhereInput = {
      exitDate: { gte: start, lte: end },
    };
    const todayUtc = startOfUtcDay(new Date());
    const delayedInPeriodWhere: Prisma.OrderWhereInput = {
      AND: [
        periodWhere,
        {
          requestedDeliveryDate: { lt: todayUtc },
          status: { notIn: DELAYED_EXCLUDED },
        },
      ],
    };
    const semNfWhere: Prisma.OrderWhereInput = {
      status: OrderStatus.FINALIZADO,
      OR: [{ invoiceNumber: null }, { invoiceNumber: '' }],
    };

    const [
      faturamentoMesAgg,
      faturamentoTotalAgg,
      ticketMedioAgg,
      totalPedidosMes,
      totalPedidosTodos,
      pedidosConcluidos,
      pedidosAtrasados,
      fluxoCounts,
      topRecebedoresRaw,
      topTransportadorasRaw,
      pedidosSemNF,
      atividadesRecentes,
      pedidosUrgentes,
      pedidosAtrasadosAlerta,
      finalizedForSla,
    ] = await Promise.all([
      this.prisma.client.order.aggregate({
        where: finalizedInPeriodWhere,
        _sum: { totalValue: true },
      }),
      this.prisma.client.order.aggregate({
        where: { status: OrderStatus.FINALIZADO },
        _sum: { totalValue: true },
      }),
      this.prisma.client.order.aggregate({
        where: periodWhere,
        _avg: { totalValue: true },
      }),
      this.prisma.client.order.count({ where: periodWhere }),
      this.prisma.client.order.count(),
      this.prisma.client.order.count({ where: finalizedInPeriodWhere }),
      this.prisma.client.order.count({ where: delayedInPeriodWhere }),
      Promise.all(
        FLUXO_STATUSES.map(async (status) => ({
          status,
          total: await this.prisma.client.order.count({ where: { status } }),
        })),
      ),
      this.prisma.client.order.groupBy({
        by: ['receiverName'],
        where: {
          ...periodWhere,
          receiverName: { not: null },
          NOT: { receiverName: '' },
        },
        _sum: { totalValue: true },
        orderBy: { _sum: { totalValue: 'desc' } },
        take: 5,
      }),
      this.prisma.client.orderExit.groupBy({
        by: ['carrierName'],
        where: {
          ...exitPeriodWhere,
          carrierName: { not: null },
          NOT: { carrierName: '' },
        },
        _count: { _all: true },
        orderBy: { _count: { carrierName: 'desc' } },
        take: 5,
      }),
      this.prisma.client.order.count({ where: semNfWhere }),
      this.prisma.client.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          action: true,
          userId: true,
          entityId: true,
          createdAt: true,
          changes: true,
        },
      }),
      this.prisma.client.order.count({
        where: {
          priority: { lte: 2 },
          status: { notIn: TERMINAL_STATUSES },
        },
      }),
      this.prisma.client.order.count({
        where: {
          requestedDeliveryDate: { lt: todayUtc },
          status: { notIn: DELAYED_EXCLUDED },
        },
      }),
      this.prisma.client.order.findMany({
        where: finalizedInPeriodWhere,
        select: {
          requestedDeliveryDate: true,
          shippedAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const fluxo: Record<
      'NOVO' | 'EM_SEPARACAO' | 'AGUARDANDO_NF' | 'FINALIZADO' | 'PARCIAL' | 'CANCELADO',
      number
    > = {
      NOVO: 0,
      EM_SEPARACAO: 0,
      AGUARDANDO_NF: 0,
      FINALIZADO: 0,
      PARCIAL: 0,
      CANCELADO: 0,
    };
    for (const row of fluxoCounts) {
      if (row.status in fluxo) {
        fluxo[row.status as keyof typeof fluxo] = row.total;
      }
    }

    const taxaSLA = this.calcTaxaSla(finalizedForSla);

    return {
      financeiro: {
        faturamentoMes: decimalToNumber(faturamentoMesAgg._sum.totalValue),
        faturamentoTotal: decimalToNumber(faturamentoTotalAgg._sum.totalValue),
        ticketMedio: decimalToNumber(ticketMedioAgg._avg.totalValue),
        totalPedidosMes,
        totalPedidosTodos,
        pedidosConcluidos,
        pedidosAtrasados,
        taxaSLA,
      },
      fluxo,
      topRecebedores: topRecebedoresRaw.map((row) => ({
        nome: row.receiverName ?? '—',
        total: decimalToNumber(row._sum.totalValue),
      })),
      topTransportadoras: topTransportadorasRaw.map((row) => ({
        nome: row.carrierName ?? '—',
        total: row._count._all,
      })),
      pedidosSemNF,
      atividadesRecentes: atividadesRecentes.map((row) => ({
        action: row.action,
        userId: row.userId ?? '',
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        changes: row.changes,
      })),
      alertas: {
        pedidosUrgentes,
        pedidosAtrasados: pedidosAtrasadosAlerta,
        pedidosSemNF,
      },
    };
  }

  private resolveRange(dataInicio?: string, dataFim?: string): {
    start: Date;
    end: Date;
  } {
    if (!dataInicio && !dataFim) {
      return currentMonthRange();
    }

    const start = dataInicio
      ? startOfUtcDay(parseYmdOrThrow(dataInicio, 'dataInicio'))
      : currentMonthRange().start;
    const end = dataFim
      ? endOfUtcDay(parseYmdOrThrow(dataFim, 'dataFim'))
      : endOfUtcDay(
          new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)),
        );

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('dataInicio não pode ser posterior a dataFim.');
    }

    return { start, end };
  }

  private calcTaxaSla(
    orders: Array<{
      requestedDeliveryDate: Date | null;
      shippedAt: Date | null;
      updatedAt: Date;
    }>,
  ): number {
    if (orders.length === 0) return 0;

    let onTime = 0;
    let eligible = 0;

    for (const order of orders) {
      if (!order.requestedDeliveryDate) continue;
      eligible += 1;
      const completion = order.shippedAt ?? order.updatedAt;
      if (completion.getTime() <= endOfUtcDay(order.requestedDeliveryDate).getTime()) {
        onTime += 1;
      }
    }

    if (eligible === 0) return 100;
    return Math.round((onTime / eligible) * 1000) / 10;
  }
}
