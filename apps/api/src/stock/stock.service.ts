import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { OrderStatus, Prisma, StockMovementType } from '@erp/database';

import type {

  CreateStockMovementDto,

  MovementTypeFilter,

  StockMovementQueryDto,

} from './dto/stock-movement.dto';

import {
  mapMovementKindToPrisma,
  mapPrismaToMovementKind,
  mapTypeFilterToPrismaTypes,
  mapTypesFiltersToPrismaTypes,
  parseTypesFilterParam,
  ENTRADA_SUMMARY_TYPES,
  SAIDA_SUMMARY_TYPES,
} from './dto/stock-movement.dto';

import type { StockSummaryQueryDto } from './dto/stock-summary.dto';

import { AuditService } from '../common/audit.service';
import { AppLogger } from '../common/logger/app-logger';

import { PrismaService } from '../prisma/prisma.service';



type StockTx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class StockService implements OnModuleInit {
  private readonly logger = new AppLogger(StockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    try {
      const removed = await this.cleanOrphanStockMovements();
      if (removed > 0) {
        this.logger.info('Orphan stock movements removed on startup', {
          removed,
        });
      }
    } catch (err: unknown) {
      this.logger.warn('Failed to clean orphan stock movements on startup', {
        fallbackUsed: true,
        error: err,
      });
    }
  }



  async summary(query?: StockSummaryQueryDto) {
    const [activeProducts, inactiveProducts, agg, lowStockRows, valorRows] =
      await Promise.all([
        this.prisma.client.product.count({ where: { isActive: true } }),
        this.prisma.client.product.count({ where: { isActive: false } }),
        this.prisma.client.product.aggregate({
          where: { isActive: true },
          _sum: { stockQty: true },
        }),
        this.prisma.client.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(*)::bigint as count
          FROM "Product"
          WHERE "isActive" = true AND "stockQty" < "minStock"
        `,
        this.prisma.client.$queryRaw<
          [{ valorEstoque: Prisma.Decimal; valorVenda: Prisma.Decimal }]
        >`
          SELECT
            COALESCE(SUM("stockQty" * COALESCE("cost", 0)), 0) as "valorEstoque",
            COALESCE(SUM("stockQty" * "price"), 0) as "valorVenda"
          FROM "Product"
          WHERE "isActive" = true
        `,
      ]);

    const belowMin = Number(lowStockRows[0]?.count ?? BigInt(0));
    const totalUnitsOnHand = agg._sum.stockQty ?? 0;
    const valorEstoque = Number(valorRows[0]?.valorEstoque ?? 0);
    const valorVenda = Number(valorRows[0]?.valorVenda ?? 0);

    const base = {
      activeProducts,
      inactiveProducts,
      totalUnitsOnHand,
      skusBelowMinStock: belowMin,
      valorEstoque,
      valorVenda,
    };

    if (!query?.startDate && !query?.endDate) {
      return base;
    }

    const periodStart = query.startDate
      ? this.calendarDayStart(query.startDate)
      : new Date(0);
    const periodEnd = query.endDate
      ? this.calendarDayEnd(query.endDate)
      : new Date();

    const movements = await this.prisma.client.stockMovement.findMany({
      where: {
        movementDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        movementDate: true,
        movementType: true,
        quantity: true,
        productId: true,
        product: {
          select: { sku: true, name: true },
        },
      },
    });

    let periodInboundCount = 0;
    let periodOutboundCount = 0;
    const dailyMap = new Map<string, { inbound: number; outbound: number }>();
    const productVolume = new Map<
      string,
      {
        sku: string;
        name: string;
        totalVolume: number;
      }
    >();

    for (const day of this.iterateIsoDates(
      query.startDate ?? this.toIsoDate(periodStart),
      query.endDate ?? this.toIsoDate(periodEnd),
    )) {
      dailyMap.set(day, { inbound: 0, outbound: 0 });
    }

    for (const m of movements) {
      const dayKey = this.toIsoDate(m.movementDate);
      const daily = dailyMap.get(dayKey);
      if (this.isInboundSummaryType(m.movementType)) {
        periodInboundCount += 1;
        if (daily) daily.inbound += m.quantity;
        const cur = productVolume.get(m.productId) ?? {
          sku: m.product.sku,
          name: m.product.name,
          totalVolume: 0,
        };
        cur.totalVolume += m.quantity;
        productVolume.set(m.productId, cur);
      } else if (this.isOutboundSummaryType(m.movementType)) {
        periodOutboundCount += 1;
        if (daily) daily.outbound += m.quantity;
        const cur = productVolume.get(m.productId) ?? {
          sku: m.product.sku,
          name: m.product.name,
          totalVolume: 0,
        };
        cur.totalVolume += m.quantity;
        productVolume.set(m.productId, cur);
      }
    }

    const dailyFlow = [...dailyMap.entries()].map(([date, v]) => ({
      date,
      inbound: v.inbound,
      outbound: v.outbound,
    }));

    const topMoved = [...productVolume.entries()]
      .map(([productId, x]) => ({
        productId,
        sku: x.sku,
        name: x.name,
        totalVolume: x.totalVolume,
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 10);

    const movedInPeriod = await this.prisma.client.stockMovement.groupBy({
      by: ['productId'],
      where: {
        movementDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const movedIds = movedInPeriod.map((r) => r.productId);
    const stagnantProducts = await this.prisma.client.product.findMany({
      where: {
        isActive: true,
        ...(movedIds.length > 0 ? { id: { notIn: movedIds } } : {}),
      },
      orderBy: [{ stockQty: 'desc' }, { name: 'asc' }],
      take: 10,
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
      },
    });

    const criticalRows = await this.prisma.client.$queryRaw<
      Array<{
        id: string;
        sku: string;
        name: string;
        stockQty: number;
        minStock: number;
        deficit: number;
      }>
    >`
      SELECT
        id,
        sku,
        name,
        "stockQty",
        "minStock",
        ("minStock" - "stockQty")::int AS deficit
      FROM "Product"
      WHERE "isActive" = true AND "stockQty" < "minStock"
      ORDER BY ("minStock" - "stockQty") DESC
      LIMIT 10
    `;

    const topInboundMovements = await this.prisma.client.stockMovement.findMany({
      where: {
        movementType: StockMovementType.INBOUND,
        movementDate: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { quantity: 'desc' },
      take: 10,
      select: {
        id: true,
        movementDate: true,
        quantity: true,
        product: {
          select: { sku: true, name: true },
        },
        movedBy: {
          select: { name: true },
        },
      },
    });

    const stockTrend = this.buildStockTrendForPeriod(
      query.startDate ?? this.toIsoDate(periodStart),
      query.endDate ?? this.toIsoDate(periodEnd),
      movements,
      totalUnitsOnHand,
    );

    return {
      ...base,
      periodInboundCount,
      periodOutboundCount,
      dailyFlow,
      topMoved,
      stagnantProducts,
      criticalProducts: criticalRows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        stockQty: Number(r.stockQty),
        minStock: Number(r.minStock),
        deficit: Number(r.deficit),
      })),
      topInboundMovements: topInboundMovements.map((m) => ({
        id: m.id,
        movementDate: m.movementDate.toISOString(),
        quantity: m.quantity,
        productSku: m.product.sku,
        productName: m.product.name,
        movedByName: m.movedBy?.name ?? null,
      })),
      stockTrend,
    };
  }

  private toIsoDate(d: Date): string {
    return this.toBusinessCalendarDate(d);
  }

  /** Calendário operacional (America/Sao_Paulo) para agrupar movimentações por dia. */
  private toBusinessCalendarDate(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }

  /** Início do dia civil no fuso America/Sao_Paulo (UTC-3, sem horário de verão). */
  private calendarDayStart(isoDate: string): Date {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 3, 0, 0, 0));
  }

  /** Fim do dia civil no fuso America/Sao_Paulo. */
  private calendarDayEnd(isoDate: string): Date {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + 1, 2, 59, 59, 999));
  }

  private isInboundSummaryType(type: StockMovementType): boolean {
    return ENTRADA_SUMMARY_TYPES.includes(type);
  }

  private isOutboundSummaryType(type: StockMovementType): boolean {
    return SAIDA_SUMMARY_TYPES.includes(type);
  }

  private iterateIsoDates(startDate: string, endDate: string): string[] {
    const days: string[] = [];
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const cur = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    while (cur <= end) {
      days.push(this.toBusinessCalendarDate(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return days;
  }

  private buildStockTrendForPeriod(
    startDate: string,
    endDate: string,
    movements: Array<{
      movementDate: Date;
      movementType: StockMovementType;
      quantity: number;
    }>,
    currentTotal: number,
  ): Array<{ date: string; value: number }> {
    const deltas = new Map<string, number>();
    for (const m of movements) {
      const key = this.toIsoDate(m.movementDate);
      const sign = this.isInboundSummaryType(m.movementType)
        ? 1
        : this.isOutboundSummaryType(m.movementType)
          ? -1
          : 0;
      deltas.set(key, (deltas.get(key) ?? 0) + sign * m.quantity);
    }

    const days = this.iterateIsoDates(startDate, endDate);
    let stockAtEnd = currentTotal;
    for (let i = days.length - 1; i >= 0; i -= 1) {
      const day = days[i];
      if (!day) continue;
      stockAtEnd -= deltas.get(day) ?? 0;
    }

    const points: Array<{ date: string; value: number }> = [];
    let running = stockAtEnd;
    for (const day of days) {
      running += deltas.get(day) ?? 0;
      points.push({ date: day, value: Math.max(0, running) });
    }
    return points;
  }

  private buildMovementWhere(
    query: StockMovementQueryDto,
  ): Prisma.StockMovementWhereInput {
    const where: Prisma.StockMovementWhereInput = {};

    if (query.productId) {
      where.productId = query.productId;
    }

    const parsedTypes = query.types
      ? parseTypesFilterParam(query.types)
      : [];
    if (parsedTypes.length > 0) {
      where.movementType = {
        in: mapTypesFiltersToPrismaTypes(parsedTypes),
      };
    } else if (query.type) {
      where.movementType = {
        in: mapTypeFilterToPrismaTypes(query.type as MovementTypeFilter),
      };
    } else if (query.movementType) {
      where.movementType = query.movementType;
    }

    if (query.userId) {
      where.movedById = query.userId;
    }

    const search = query.search?.trim();
    if (search) {
      where.product = {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    if (query.startDate || query.endDate) {
      where.movementDate = {};
      if (query.startDate) {
        where.movementDate.gte = this.calendarDayStart(query.startDate);
      }
      if (query.endDate) {
        where.movementDate.lte = this.calendarDayEnd(query.endDate);
      }
    }

    return where;
  }



  async movementsSummary(query: StockMovementQueryDto) {
    const baseQuery = {
      ...query,
      type: undefined,
      types: undefined,
      movementType: undefined,
    };
    const baseWhere = this.buildMovementWhere(baseQuery);
    const ajusteTypes = mapTypeFilterToPrismaTypes('ajuste');

    const [inboundAgg, outboundAgg, reservedAgg, totalAdjustments] =
      await Promise.all([
        this.prisma.client.stockMovement.aggregate({
          where: {
            ...baseWhere,
            movementType: { in: ENTRADA_SUMMARY_TYPES },
          },
          _sum: { quantity: true },
        }),
        this.prisma.client.stockMovement.aggregate({
          where: {
            ...baseWhere,
            movementType: { in: SAIDA_SUMMARY_TYPES },
          },
          _sum: { quantity: true },
        }),
        this.prisma.client.stockMovement.aggregate({
          where: {
            ...baseWhere,
            movementType: {
              in: [StockMovementType.RESERVE, StockMovementType.RESERVA],
            },
          },
          _sum: { quantity: true },
        }),
        this.prisma.client.stockMovement.count({
          where: {
            ...baseWhere,
            movementType: { in: ajusteTypes },
          },
        }),
      ]);

    const totalInbound = inboundAgg._sum.quantity ?? 0;
    const totalOutbound = outboundAgg._sum.quantity ?? 0;
    const totalReserved = reservedAgg._sum.quantity ?? 0;

    return {
      totalInbound,
      totalOutbound,
      totalReserved,
      totalAdjustments,
      netBalance: totalInbound - totalOutbound,
    };
  }



  async listMovements(query: StockMovementQueryDto) {
    await this.cleanOrphanStockMovements();

    const page =

      query.page !== undefined && query.page > 0 ? query.page : 1;

    const pageSize =

      query.pageSize !== undefined &&

      query.pageSize > 0 &&

      query.pageSize <= 100

        ? query.pageSize

        : 20;



    const where = this.buildMovementWhere(query);

    const total = await this.prisma.client.stockMovement.count({ where });

    const rows = await this.prisma.client.stockMovement.findMany({

      where,

      orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],

      skip: (page - 1) * pageSize,

      take: pageSize,

      include: {

        product: {

          select: {

            id: true,

            name: true,

            sku: true,

            internalCode: true,

          },

        },

        movedBy: {

          select: { id: true, name: true, email: true },

        },

      },

    });



    return {

      data: rows.map((m) => ({

        id: m.id,

        movementType: m.movementType,

        quantity: m.quantity,

        reference: m.reference,

        invoiceNumber: m.invoiceNumber,

        notes: m.notes,

        movementDate: m.movementDate.toISOString(),

        createdAt: m.createdAt.toISOString(),

        product: m.product,

        movedBy: m.movedBy,

      })),

      meta: {

        page,

        pageSize,

        total,

        totalPages: Math.max(1, Math.ceil(total / pageSize)),

      },

    };

  }



  async getMovementDetail(movementId: string) {
    const movement = await this.prisma.client.stockMovement.findUnique({
      where: { id: movementId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            internalCode: true,
          },
        },
        movedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimentação não encontrada.');
    }

    const parsed = StockService.parseMovementOrderRefs(movement);
    const order = await this.findOrderByMovementReference(
      this.prisma.client,
      movement,
    );

    let orderDetail: Record<string, unknown> | null = null;
    let relatedMovements: Array<Record<string, unknown>> = [];

    if (order) {
      const full = await this.prisma.client.order.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          status: true,
          customerName: true,
          customerDocument: true,
          receiverName: true,
          unloadingPoint: true,
          deliveryCnpj: true,
          deliveryAddress: true,
          deliveryCity: true,
          deliveryState: true,
          notes: true,
          notaRemessa: true,
          notaRemessaConfirmada: true,
          volumes: true,
          carrierId: true,
          carrier: { select: { name: true } },
          invoiceNumber: true,
          requestedDeliveryDate: true,
          orderDate: true,
        },
      });

      if (full) {
        orderDetail = {
          ...full,
          carrierName: full.carrier?.name ?? null,
          orderDate: full.orderDate?.toISOString() ?? null,
          requestedDeliveryDate:
            full.requestedDeliveryDate?.toISOString() ?? null,
          displayNumber:
            full.externalOrderNumber?.trim() || full.code || parsed.orderLabel,
        };

        const siblings = await this.prisma.client.stockMovement.findMany({
          where: StockService.buildOrderStockMovementWhere(full),
          orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: {
            product: {
              select: { sku: true, name: true },
            },
          },
        });

        relatedMovements = siblings.map((m) => ({
          id: m.id,
          movementType: m.movementType,
          quantity: m.quantity,
          movementDate: m.movementDate.toISOString(),
          productSku: m.product.sku,
          productName: m.product.name,
          invoiceNumber: m.invoiceNumber,
          reference: m.reference,
        }));
      }
    }

    return {
      movement: {
        id: movement.id,
        movementType: movement.movementType,
        quantity: movement.quantity,
        reference: movement.reference,
        invoiceNumber: movement.invoiceNumber,
        notes: movement.notes,
        movementDate: movement.movementDate.toISOString(),
        createdAt: movement.createdAt.toISOString(),
        product: movement.product,
        movedBy: movement.movedBy,
      },
      parsed,
      order: orderDetail,
      relatedMovements,
    };
  }

  static parseMovementOrderRefs(movement: {
    reference: string | null;
    invoiceNumber: string | null;
    notes: string | null;
  }): { orderLabel: string | null; invoiceLabel: string | null } {
    let orderLabel: string | null = null;
    const fromNotes = movement.notes
      ?.match(/pedido\s+(.+?)(?:\s*[-·•]|\s+NF\b|$)/i)?.[1]
      ?.trim();
    if (fromNotes) {
      orderLabel = fromNotes;
    } else if (movement.reference?.trim().startsWith('PED-')) {
      orderLabel = movement.reference.trim();
    }

    let invoiceLabel =
      movement.invoiceNumber?.trim() ||
      movement.reference?.trim() ||
      null;
    const nfFromNotes = movement.notes?.match(/\bNF\s+(\S+)/i)?.[1]?.trim();
    if (nfFromNotes) {
      invoiceLabel = nfFromNotes;
    }

    if (invoiceLabel && orderLabel === invoiceLabel) {
      invoiceLabel = nfFromNotes ?? movement.invoiceNumber?.trim() ?? null;
    }

    return { orderLabel, invoiceLabel };
  }



  async createMovement(

    userId: string,

    dto: CreateStockMovementDto,

  ) {

    const type =
      dto.movementType ??
      (dto.movementKind ? mapMovementKindToPrisma(dto.movementKind) : undefined);

    if (!type) {
      throw new BadRequestException(
        'Informe movementKind (ex.: entrada) ou movementType (ex.: INBOUND).',
      );
    }



    if (type === StockMovementType.TRANSFER) {

      throw new BadRequestException(

        'Tipo de movimentação não permitido neste fluxo.',

      );

    }



    if (type === StockMovementType.ADJUSTMENT || type === StockMovementType.AJUSTE_QUANTIDADE) {

      if (dto.quantity === 0) {

        throw new BadRequestException(

          'Em ajustes de quantidade, informe uma quantidade diferente de zero (positiva para aumentar o saldo ou negativa para reduzir).',

        );

      }

    } else if (
      type === StockMovementType.AJUSTE_PRECO_VENDA ||
      type === StockMovementType.AJUSTE_PRECO_BASE
    ) {
      if (dto.quantity !== 0) {
        throw new BadRequestException(
          'Ajustes de preço registram quantidade zero no movimento.',
        );
      }
    } else if (dto.quantity <= 0) {

      throw new BadRequestException(

        'Para este tipo de movimento, a quantidade deve ser um inteiro maior que zero.',

      );

    }



    const result = await this.prisma.client.$transaction(async (tx) => {

      const product = await tx.product.findUnique({

        where: { id: dto.productId },

      });



      if (!product) {

        throw new NotFoundException(

          'Produto não encontrado. Verifique o cadastro e tente novamente.',

        );

      }

      if (!product.isActive) {

        throw new BadRequestException(

          'Não é possível movimentar estoque de produto inativo.',

        );

      }



      const qty = dto.quantity;



      if (type === StockMovementType.INBOUND) {

        await tx.product.update({

          where: { id: dto.productId },

          data: { stockQty: { increment: qty } },

        });

      } else if (

        type === StockMovementType.OUTBOUND ||

        type === StockMovementType.RESERVE

      ) {

        const updated = await tx.product.updateMany({

          where: { id: dto.productId, stockQty: { gte: qty } },

          data: { stockQty: { decrement: qty } },

        });

        if (updated.count !== 1) {

          throw new ConflictException(

            'Saldo insuficiente no estoque para concluir a saída ou reserva.',

          );

        }

      } else if (type === StockMovementType.RESERVE_CANCEL) {

        await tx.product.update({

          where: { id: dto.productId },

          data: { stockQty: { increment: qty } },

        });

      } else if (
        type === StockMovementType.RESERVA ||
        type === StockMovementType.BAIXA_EXPEDICAO ||
        type === StockMovementType.SAIDA_EXPEDICAO
      ) {

        throw new BadRequestException(
          'Este tipo de movimentação é gerado apenas pela Expedição.',
        );

      } else if (
        type === StockMovementType.ADJUSTMENT ||
        type === StockMovementType.AJUSTE_QUANTIDADE
      ) {

        if (qty > 0) {

          await tx.product.update({

            where: { id: dto.productId },

            data: { stockQty: { increment: qty } },

          });

        } else {

          const decrement = -qty;

          const updated = await tx.product.updateMany({

            where: { id: dto.productId, stockQty: { gte: decrement } },

            data: { stockQty: { decrement } },

          });

          if (updated.count !== 1) {

            throw new ConflictException(

              'Saldo insuficiente: o ajuste negativo deixaria o estoque abaixo de zero.',

            );

          }

        }

      } else if (
        type === StockMovementType.AJUSTE_PRECO_VENDA ||
        type === StockMovementType.AJUSTE_PRECO_BASE
      ) {
        /* Apenas registro de auditoria — preço é atualizado via PATCH /products. */
      }



      const movement = await tx.stockMovement.create({

        data: {

          productId: dto.productId,

          movementType: type,

          quantity: qty,

          reference: dto.reference?.trim() ? dto.reference.trim() : null,

          notes: dto.notes?.trim() ? dto.notes.trim() : null,

          movedById: userId,

          movementDate: dto.movementDate ?? new Date(),

        },

        include: {

          product: {

            select: {

              id: true,

              name: true,

              sku: true,

              internalCode: true,

              stockQty: true,

            },

          },

          movedBy: {

            select: { id: true, name: true, email: true },

          },

        },

      });



      return {

        id: movement.id,

        movementType: movement.movementType,

        movementKind:
          dto.movementKind ?? mapPrismaToMovementKind(movement.movementType),

        quantity: movement.quantity,

        reference: movement.reference,

        notes: movement.notes,

        movementDate: movement.movementDate.toISOString(),

        createdAt: movement.createdAt.toISOString(),

        product: movement.product,

        movedBy: movement.movedBy,

      };

    });



    await this.audit.log({

      userId,

      action: 'STOCK_MOVEMENT_CREATED',

      entity: 'StockMovement',

      entityId: result.id,

      changes: {

        productId: dto.productId,

        movementKind:
          dto.movementKind ?? mapPrismaToMovementKind(result.movementType),

        movementType: result.movementType,

        quantity: dto.quantity,

        notes: dto.notes ?? null,

        reference: dto.reference ?? null,

        newStockQty: result.product.stockQty,

      },

    });



    return result;

  }

  private parsePriceReferenceFrom(
    reference: string | null,
  ): Prisma.Decimal | null {
    if (!reference?.includes('|')) return null;
    const [from] = reference.split('|');
    if (!from) return null;
    const n = Number(from);
    if (Number.isNaN(n)) return null;
    return new Prisma.Decimal(n.toFixed(2));
  }

  async evaluateMovementDelete(movementId: string): Promise<{
    wouldCauseNegativeBalance: boolean;
  }> {
    const movement = await this.prisma.client.stockMovement.findUnique({
      where: { id: movementId },
      include: {
        product: { select: { stockQty: true } },
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimentação não encontrada.');
    }

    const wouldCauseNegativeBalance =
      movement.movementType === StockMovementType.INBOUND &&
      movement.product.stockQty < movement.quantity;

    return { wouldCauseNegativeBalance };
  }

  async deleteMovement(
    adminUserId: string,
    movementId: string,
    options?: { allowNegativeBalance?: boolean },
  ) {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id: movementId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              stockQty: true,
            },
          },
          movedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (!movement) {
        throw new NotFoundException('Movimentação não encontrada.');
      }

      const expeditionSnapshot = {
        reference: movement.reference,
        invoiceNumber: movement.invoiceNumber,
        notes: movement.notes,
        movementType: movement.movementType,
      };

      await this.revertMovementForOrderDelete(tx, movement, {
        allowNegativeBalance: options?.allowNegativeBalance,
      });

      await tx.stockMovement.delete({ where: { id: movementId } });

      await this.syncOrderExitAfterExpeditionMovementRemoved(
        tx,
        expeditionSnapshot,
      );

      const updatedProduct = await tx.product.findUnique({
        where: { id: movement.productId },
        select: { stockQty: true, price: true, cost: true },
      });

      return { movement, updatedProduct };
    });

    const deleter = await this.prisma.client.user.findUnique({
      where: { id: adminUserId },
      select: { name: true },
    });

    const deletedAt = new Date();

    const resultingStockQty = result.updatedProduct?.stockQty ?? null;
    const forcedNegativeDeletion =
      Boolean(options?.allowNegativeBalance) &&
      resultingStockQty !== null &&
      resultingStockQty < 0;

    await this.audit.log({
      userId: adminUserId,
      action: forcedNegativeDeletion
        ? 'EXCLUSÃO FORÇADA DE MOVIMENTAÇÃO (ADMIN — SALDO NEGATIVO)'
        : 'EXCLUSÃO DE MOVIMENTAÇÃO',
      entity: 'StockMovement',
      entityId: movementId,
      changes: {
        productName: result.movement.product.name,
        productSku: result.movement.product.sku,
        movementType: result.movement.movementType,
        quantityReverted: result.movement.quantity,
        reference: result.movement.reference,
        originalMovedBy: result.movement.movedBy?.name ?? null,
        originalMovementDate: result.movement.movementDate.toISOString(),
        deletedBy: deleter?.name ?? adminUserId,
        deletedAt: deletedAt.toISOString(),
        newStockQty: resultingStockQty,
        ...(forcedNegativeDeletion
          ? {
              forcedAdminDeletion: true,
              negativeBalanceAfterDeletion: true,
              resultingStockQty,
            }
          : {}),
      },
    });

    return { ok: true, id: movementId };
  }

  /** Referências usadas pela expedição em `StockMovement.reference` / `notes`. */
  static buildOrderStockMovementWhere(
    order: {
      code: string;
      externalOrderNumber: string | null;
      invoiceNumber: string | null;
    },
  ): Prisma.StockMovementWhereInput {
    const refs = new Set<string>([order.code]);
    const ext = order.externalOrderNumber?.trim();
    if (ext) refs.add(ext);
    const inv = order.invoiceNumber?.trim();
    if (inv) refs.add(inv);

    const or: Prisma.StockMovementWhereInput[] = [
      { reference: { in: [...refs] } },
      { notes: { contains: order.code, mode: 'insensitive' } },
    ];
    if (ext) {
      or.push({ notes: { contains: ext, mode: 'insensitive' } });
    }
    if (inv) {
      or.push({ invoiceNumber: inv });
    }
    return { OR: or };
  }

  private async safeDecrementReservedQty(
    tx: StockTx,
    productId: string,
    qty: number,
  ): Promise<void> {
    if (qty <= 0) return;
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { reservedQty: true },
    });
    const dec = Math.min(qty, product?.reservedQty ?? 0);
    if (dec <= 0) return;
    await tx.product.update({
      where: { id: productId },
      data: { reservedQty: { decrement: dec } },
    });
  }

  private async revertMovementForOrderDelete(
    tx: StockTx,
    movement: {
      productId: string;
      movementType: StockMovementType;
      quantity: number;
      notes: string | null;
      reference: string | null;
    },
    options?: { allowNegativeBalance?: boolean },
  ): Promise<void> {
    const type = movement.movementType;
    const qty = movement.quantity;
    const { productId } = movement;

    if (type === StockMovementType.INBOUND) {
      if (options?.allowNegativeBalance) {
        await tx.product.update({
          where: { id: productId },
          data: { stockQty: { decrement: qty } },
        });
      } else {
        const updated = await tx.product.updateMany({
          where: { id: productId, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Não é possível reverter entrada do pedido: saldo atual ficaria negativo.',
          );
        }
      }
    } else if (
      type === StockMovementType.OUTBOUND ||
      type === StockMovementType.RESERVE
    ) {
      await tx.product.update({
        where: { id: productId },
        data: { stockQty: { increment: qty } },
      });
    } else if (type === StockMovementType.RESERVE_CANCEL) {
      const physical = movement.notes?.includes('física') ?? false;
      if (physical) {
        await tx.product.update({
          where: { id: productId },
          data: { reservedQty: { increment: qty } },
        });
      } else {
        const updated = await tx.product.updateMany({
          where: { id: productId, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Não é possível reverter liberação de reserva do pedido: saldo insuficiente.',
          );
        }
      }
    } else if (type === StockMovementType.RESERVA) {
      await this.safeDecrementReservedQty(tx, productId, qty);
    } else if (
      type === StockMovementType.SAIDA_EXPEDICAO ||
      type === StockMovementType.BAIXA_EXPEDICAO
    ) {
      await tx.product.update({
        where: { id: productId },
        data: { stockQty: { increment: qty } },
      });
    } else if (
      type === StockMovementType.ADJUSTMENT ||
      type === StockMovementType.AJUSTE_QUANTIDADE
    ) {
      if (qty > 0) {
        const updated = await tx.product.updateMany({
          where: { id: productId, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Não é possível reverter ajuste do pedido: saldo ficaria negativo.',
          );
        }
      } else if (qty < 0) {
        await tx.product.update({
          where: { id: productId },
          data: { stockQty: { increment: -qty } },
        });
      }
    } else if (
      type === StockMovementType.AJUSTE_PRECO_VENDA ||
      type === StockMovementType.AJUSTE_PRECO_BASE
    ) {
      const fromPrice = this.parsePriceReferenceFrom(movement.reference);
      if (!fromPrice) return;
      await tx.product.update({
        where: { id: productId },
        data:
          type === StockMovementType.AJUSTE_PRECO_VENDA
            ? { price: fromPrice }
            : { cost: fromPrice },
      });
    }
  }

  /**
   * Remove dados de estoque/expedição vinculados ao pedido, na ordem correta de FKs.
   * Não exclui o registro `Order` — o chamador deve deletá-lo ao final.
   */
  async purgeOrderRelatedData(
    tx: StockTx,
    order: {
      id: string;
      code: string;
      externalOrderNumber: string | null;
      invoiceNumber: string | null;
    },
  ): Promise<{
    deletedReservations: number;
    deletedMovements: number;
    deletedExits: number;
    deletedItems: number;
  }> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId: order.id },
      orderBy: { productId: 'asc' },
    });

    for (const r of reservations) {
      await this.safeDecrementReservedQty(tx, r.productId, r.quantity);
    }
    const delRes = await tx.stockReservation.deleteMany({
      where: { orderId: order.id },
    });

    const movementWhere = StockService.buildOrderStockMovementWhere(order);
    const movements = await tx.stockMovement.findMany({
      where: movementWhere,
      orderBy: { movementDate: 'desc' },
    });

    for (const m of movements) {
      await this.revertMovementForOrderDelete(tx, m);
    }
    const delMov =
      movements.length > 0
        ? await tx.stockMovement.deleteMany({
            where: { id: { in: movements.map((m) => m.id) } },
          })
        : { count: 0 };

    const delExit = await tx.orderExit.deleteMany({
      where: { orderId: order.id },
    });

    const delItems = await tx.orderItem.deleteMany({
      where: { orderId: order.id },
    });

    return {
      deletedReservations: delRes.count,
      deletedMovements: delMov.count,
      deletedExits: delExit.count,
      deletedItems: delItems.count,
    };
  }

  private isOrderLinkedMovement(movement: {
    movementType: StockMovementType;
    reference: string | null;
    notes: string | null;
  }): boolean {
    if (
      movement.movementType === StockMovementType.RESERVA ||
      movement.movementType === StockMovementType.SAIDA_EXPEDICAO ||
      movement.movementType === StockMovementType.BAIXA_EXPEDICAO ||
      movement.movementType === StockMovementType.RESERVE_CANCEL
    ) {
      return true;
    }
    if (movement.reference?.startsWith('PED-')) return true;
    return false;
  }

  private async findOrderByMovementReference(
    tx: StockTx | PrismaService['client'],
    movement: {
      reference: string | null;
      invoiceNumber: string | null;
      notes: string | null;
    },
  ) {
    const candidates = new Set<string>();
    if (movement.reference?.trim()) candidates.add(movement.reference.trim());
    if (movement.invoiceNumber?.trim()) {
      candidates.add(movement.invoiceNumber.trim());
    }
    const codeFromNotes = movement.notes?.match(/PED-\d+/i)?.[0];
    if (codeFromNotes) candidates.add(codeFromNotes);

    const pedidoFromNotes = movement.notes
      ?.match(/pedido\s+(.+?)(?:\s*[-·•]|\s+NF\b|$)/i)?.[1]
      ?.trim();
    if (pedidoFromNotes) candidates.add(pedidoFromNotes);

    const nfFromNotes = movement.notes?.match(/\bNF\s+(\S+)/i)?.[1]?.trim();
    if (nfFromNotes) candidates.add(nfFromNotes);

    if (candidates.size === 0) return null;

    const refs = [...candidates];
    return tx.order.findFirst({
      where: {
        OR: [
          { code: { in: refs } },
          { externalOrderNumber: { in: refs } },
          { invoiceNumber: { in: refs } },
        ],
      },
      select: {
        id: true,
        code: true,
        externalOrderNumber: true,
        invoiceNumber: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Remove movimentações cujo pedido referenciado não existe mais. */
  async cleanOrphanStockMovements(): Promise<number> {
    const candidates = await this.prisma.client.stockMovement.findMany({
      where: {
        OR: [
          {
            movementType: {
              in: [
                StockMovementType.RESERVA,
                StockMovementType.SAIDA_EXPEDICAO,
                StockMovementType.BAIXA_EXPEDICAO,
                StockMovementType.RESERVE_CANCEL,
              ],
            },
          },
          { reference: { startsWith: 'PED-' } },
        ],
      },
      select: {
        id: true,
        reference: true,
        invoiceNumber: true,
        notes: true,
        movementType: true,
      },
    });

    const orphanIds: string[] = [];
    for (const m of candidates) {
      if (!this.isOrderLinkedMovement(m)) continue;
      const order = await this.findOrderByMovementReference(
        this.prisma.client,
        m,
      );
      if (!order) orphanIds.push(m.id);
    }

    if (orphanIds.length === 0) return 0;

    const deleted = await this.prisma.client.stockMovement.deleteMany({
      where: { id: { in: orphanIds } },
    });
    return deleted.count;
  }

  private async syncOrderExitAfterExpeditionMovementRemoved(
    tx: StockTx,
    movement: {
      reference: string | null;
      invoiceNumber: string | null;
      notes: string | null;
      movementType: StockMovementType;
    },
  ): Promise<void> {
    if (
      movement.movementType !== StockMovementType.SAIDA_EXPEDICAO &&
      movement.movementType !== StockMovementType.BAIXA_EXPEDICAO
    ) {
      return;
    }

    const order = await this.findOrderByMovementReference(tx, movement);
    if (!order) return;

    const remaining = await tx.stockMovement.count({
      where: {
        AND: [
          StockService.buildOrderStockMovementWhere(order),
          {
            movementType: {
              in: [
                StockMovementType.SAIDA_EXPEDICAO,
                StockMovementType.BAIXA_EXPEDICAO,
              ],
            },
          },
        ],
      },
    });

    if (remaining > 0) return;

    await tx.orderExit.deleteMany({ where: { orderId: order.id } });

    if (order.status === OrderStatus.FINALIZADO) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.AGUARDANDO_NF,
          shippedAt: null,
        },
      });
    }
  }

  /**
   * Remove saída de expedição e movimentações de estoque vinculadas, revertendo saldo.
   */
  async purgeExitRelatedData(
    tx: StockTx,
    input: {
      exitId: string;
      invoiceNumber: string;
      order: {
        id: string;
        code: string;
        externalOrderNumber: string | null;
        invoiceNumber: string | null;
      };
    },
  ): Promise<{ deletedMovements: number }> {
    const inv = input.invoiceNumber.trim();
    const movementWhere: Prisma.StockMovementWhereInput = {
      AND: [
        StockService.buildOrderStockMovementWhere(input.order),
        {
          movementType: {
            in: [
              StockMovementType.SAIDA_EXPEDICAO,
              StockMovementType.BAIXA_EXPEDICAO,
            ],
          },
        },
        {
          OR: [{ invoiceNumber: inv }, { reference: inv }],
        },
      ],
    };

    const movements = await tx.stockMovement.findMany({
      where: movementWhere,
      orderBy: { movementDate: 'desc' },
    });

    for (const m of movements) {
      await this.revertMovementForOrderDelete(tx, m);
    }

    const delMov =
      movements.length > 0
        ? await tx.stockMovement.deleteMany({
            where: { id: { in: movements.map((m) => m.id) } },
          })
        : { count: 0 };

    await tx.orderExit.delete({ where: { id: input.exitId } });

    await tx.orderItem.updateMany({
      where: { orderId: input.order.id },
      data: { invoicedQty: 0 },
    });

    const order = await tx.order.findUnique({
      where: { id: input.order.id },
      select: { status: true, invoiceNumber: true },
    });
    if (order?.status === OrderStatus.FINALIZADO) {
      const hasInvoice = Boolean(order.invoiceNumber?.trim());
      await tx.order.update({
        where: { id: input.order.id },
        data: {
          status: hasInvoice ? OrderStatus.NF_ATRELADA : OrderStatus.AGUARDANDO_NF,
          shippedAt: null,
        },
      });
    }

    return { deletedMovements: delMov.count };
  }

}

