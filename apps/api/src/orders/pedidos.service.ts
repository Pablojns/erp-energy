import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import {
  InvoiceStatus,
  OrderItemStockStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  StockMovementType,
} from '@erp/database';
import PDFDocument from 'pdfkit';
import { AuditService } from '../common/audit.service';
import { parseStoredDeliveryAddress } from '../common/delivery-address';
import { CorreiosService } from '../correios/correios.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CarrierResolverService } from './carrier-resolver.service';
import { OrderService } from './order.service';
import type { PedidosUpdateItemDto, StatusItemValue } from './dto/pedidos-update-item.dto';
import type { PedidosUpdateStatusDto } from './dto/pedidos-update-status.dto';
import type { CreateManualPedidoDto } from './dto/create-manual-pedido.dto';
import type { CreateSitePedidoDto } from './dto/create-site-pedido.dto';
import type { CreateVendaExternaPedidoDto } from './dto/create-venda-externa-pedido.dto';
import type { PedidosAttachNfDto } from './dto/pedidos-attach-nf.dto';
import type { UpdateOrderPriorityDto } from './dto/update-order-priority.dto';
import type { UpdatePedidoAdminDto } from './dto/update-pedido-admin.dto';
import type { OrderQueryDto } from './dto/order-query.dto';
import {
  decimalFromStringOrZero,
  groupByNumeroPed,
  isoDateStringToUtcDate,
  normalizePlanilhaItemStatus,
  normalizePlanilhaInvoiceNumber,
  parseBrlMoneyToDecimalString,
  pickFirstLineOfOrderGroup,
  readPedidosSheet,
  resolveOrderStatusFromPlanilha,
  type PedidosImportSummary,
} from './pedidos-import';
import { orderStockReference } from './order-domain';
import { parseNfFlaskResult } from './nf-flask-payload';

function mapStatusItemToStockStatus(v: StatusItemValue): OrderItemStockStatus {
  if (v === 'completo') return OrderItemStockStatus.COMPLETO;
  if (v === 'parcial') return OrderItemStockStatus.PARCIAL;
  if (v === 'cancelado') return OrderItemStockStatus.SKU_NAO_ENCONTRADO;
  return OrderItemStockStatus.NAO_ANALISADO;
}

const NEXT_CODE_ADVISORY_LOCK = 94821002;
const EXPEDITION_STOCK_LOCK = 94821001;

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
    private readonly carrierResolver: CarrierResolverService,
    private readonly notifications: NotificationsService,
    private readonly correiosService: CorreiosService,
    private readonly config: ConfigService,
  ) {}

  async createManual(userId: string, dto: CreateManualPedidoDto) {
    const order = await this.orders.createManualPedido(userId, dto);
    const label =
      (order as { externalOrderNumber?: string }).externalOrderNumber ??
      (order as { code?: string }).code ??
      'novo';
    void this.notifications.createForPermission(
      'expedicao',
      'ver_pedidos',
      'Novo pedido criado',
      `Pedido manual ${label} foi criado.`,
      'novo_pedido',
      `order:${(order as { id: string }).id}`,
    );
    return order;
  }

  async createPedidoSite(userId: string, dto: CreateSitePedidoDto) {
    const created = await this.orders.createSitePedido(userId, dto);
    const orderId = (created as { id: string }).id;
    const order = await this.reserveSitePedido(orderId, userId);
    const label =
      (order as { externalOrderNumber?: string }).externalOrderNumber ??
      (order as { code?: string }).code ??
      'novo';
    void this.notifications.createForPermission(
      'expedicao',
      'ver_pedidos',
      'Novo pedido do site',
      `Pedido do site ${label} foi criado e reservado.`,
      'novo_pedido_site',
      `order:${orderId}`,
    );
    return order;
  }

  createVendaExterna(userId: string, dto: CreateVendaExternaPedidoDto) {
    return this.orders.createVendaExterna(userId, dto);
  }

  /**
   * Reserva a quantidade integral de cada linha, independente do saldo físico atual.
   * A cobertura física é reconciliada quando houver entrada de estoque (StockService).
   */
  private async reserveSitePedido(orderId: string, userId: string) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${EXPEDITION_STOCK_LOCK})`,
      );

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { orderBy: { lineNumber: 'asc' } },
        },
      });
      if (!order) {
        throw new NotFoundException('Pedido não encontrado.');
      }

      for (const line of order.items) {
        const qty = line.quantity;
        let productId = line.productId;
        let skuNorm = line.sku.trim();

        if (!productId) {
          const found = await tx.product.findFirst({
            where: {
              sku: { equals: line.sku.trim(), mode: Prisma.QueryMode.insensitive },
              isActive: true,
            },
          });
          if (found) {
            productId = found.id;
            skuNorm = found.sku;
            await tx.orderItem.update({
              where: { id: line.id },
              data: { productId },
            });
          }
        }

        if (!productId) {
          await tx.orderItem.update({
            where: { id: line.id },
            data: {
              reservedQuantity: qty,
              missingQty: qty,
              availableAtAnalysis: 0,
              stockStatus: OrderItemStockStatus.SKU_NAO_ENCONTRADO,
            },
          });
          continue;
        }

        const pRow = await tx.product.findUnique({ where: { id: productId } });
        if (!pRow?.isActive) {
          await tx.orderItem.update({
            where: { id: line.id },
            data: {
              reservedQuantity: qty,
              missingQty: qty,
              availableAtAnalysis: 0,
              stockStatus: OrderItemStockStatus.SKU_NAO_ENCONTRADO,
            },
          });
          continue;
        }

        const physicalAvailable = Math.max(0, pRow.stockQty - pRow.reservedQty);
        const missing = Math.max(0, qty - physicalAvailable);
        let stockStatus: OrderItemStockStatus;
        if (missing <= 0) {
          stockStatus = OrderItemStockStatus.COMPLETO;
        } else if (missing >= qty) {
          stockStatus = OrderItemStockStatus.SEM_ESTOQUE;
        } else {
          stockStatus = OrderItemStockStatus.PARCIAL;
        }

        await tx.orderItem.update({
          where: { id: line.id },
          data: {
            availableAtAnalysis: physicalAvailable,
            missingQty: missing,
            reservedQuantity: qty,
            stockStatus,
          },
        });

        await tx.stockReservation.deleteMany({
          where: { orderItemId: line.id },
        });

        await tx.product.update({
          where: { id: productId },
          data: { reservedQty: { increment: qty } },
        });

        await tx.stockReservation.create({
          data: {
            orderId: order.id,
            orderItemId: line.id,
            productId,
            sku: skuNorm,
            quantity: qty,
            createdById: userId,
          },
        });

        const orderRef = orderStockReference(order);
        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.RESERVA,
            quantity: qty,
            reference: orderRef,
            notes: `Reserva pedido site ${orderRef}`,
            movedById: userId,
          },
        });
      }

      const statusRows = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { stockStatus: true },
      });
      const allCompleto =
        statusRows.length > 0 &&
        statusRows.every((r) => r.stockStatus === OrderItemStockStatus.COMPLETO);
      const stockCoverage = allCompleto
        ? OrderStatus.RESERVADO
        : OrderStatus.PARCIAL;

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.EM_SEPARACAO,
          reservedAt: new Date(),
        },
      });

      await this.audit.log({
        userId,
        action: 'ORDER_SITE_RESERVE',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          status: OrderStatus.EM_SEPARACAO,
          stockCoverage,
          source: 'site',
          reservedFullQuantity: true,
        },
      });
    });

    return this.orders.findOne(orderId);
  }

  list(query: Parameters<OrderService['findMany']>[0]) {
    const q = query as OrderQueryDto;
    const search = q.search?.trim();
    const filterField = q.filterField?.trim();
    const filterValue = q.filterValue?.trim();
    const hasSearch = Boolean(search);
    const hasFieldFilter = Boolean(filterField && filterValue);
    const isSeparationWorkspace = q.workspace?.trim() === 'separation';

    if (isSeparationWorkspace) {
      return this.listSeparationWorkspaceOrders(q, {
        search,
        filterField,
        filterValue,
      });
    }

    if (!hasSearch && !hasFieldFilter) {
      return this.orders.findMany(q);
    }
    return this.listPedidosWithFilters(q, {
      search,
      filterField,
      filterValue,
    });
  }

  /** Pedidos a partir desta data entram no fluxo automático de Separação. */
  private static readonly SEPARATION_MIN_ORDER_DATE = new Date(
    '2025-07-01T00:00:00.000Z',
  );

  /** orderDate >= cutoff; se orderDate for null, usa createdAt. */
  private static separationMinDateWhere(): Prisma.OrderWhereInput {
    const cutoff = PedidosService.SEPARATION_MIN_ORDER_DATE;
    return {
      OR: [
        { orderDate: { gte: cutoff } },
        { AND: [{ orderDate: null }, { createdAt: { gte: cutoff } }] },
      ],
    };
  }

  /** Lista da aba Separação — filtra só pelo status do pedido, nunca pelo status WEG dos itens. */
  private buildSeparationListWhere(query: OrderQueryDto): Prisma.OrderWhereInput {
    const baseWhere: Prisma.OrderWhereInput =
      PedidosService.stripSeparationItemVisualFilters({
        ...(query.source ? { source: query.source as OrderSource } : {}),
      });

    return PedidosService.stripSeparationItemVisualFilters({
      AND: [
        baseWhere,
        PedidosService.separationMinDateWhere(),
        {
          // Só pedidos deliberadamente enviados ao fluxo de Separação
          // (não incluir PARCIAL/RESERVADO — ainda estão na aba Pedidos).
          status: {
            in: [
              OrderStatus.EM_SEPARACAO,
              OrderStatus.SEPARADO,
              OrderStatus.AGUARDANDO_NF,
              OrderStatus.NF_ATRELADA,
            ],
          },
        },
      ],
    });
  }

  /** Remove filtros de badge visual (status WEG / estoque por linha) do where da separação. */
  private static stripSeparationItemVisualFilters(
    where: Prisma.OrderWhereInput,
  ): Prisma.OrderWhereInput {
    return PedidosService.pruneOrderWhere(where);
  }

  private static pruneOrderWhere(
    where: Prisma.OrderWhereInput,
  ): Prisma.OrderWhereInput {
    if (!where || typeof where !== 'object') return where;

    const out: Prisma.OrderWhereInput = {};

    for (const [key, rawValue] of Object.entries(where) as Array<
      [keyof Prisma.OrderWhereInput, unknown]
    >) {
      if (rawValue === undefined) continue;

      if (key === 'items') {
        const cleaned = PedidosService.cleanItemsRelationFilter(
          rawValue as Prisma.OrderItemListRelationFilter,
        );
        if (cleaned) out.items = cleaned;
        continue;
      }

      if (key === 'AND' && Array.isArray(rawValue)) {
        const cleanedAnd = rawValue
          .map((clause) =>
            PedidosService.pruneOrderWhere(clause as Prisma.OrderWhereInput),
          )
          .filter((clause) => Object.keys(clause).length > 0);
        if (cleanedAnd.length === 1) {
          return cleanedAnd[0]!;
        }
        if (cleanedAnd.length > 1) out.AND = cleanedAnd;
        continue;
      }

      if (key === 'OR' && Array.isArray(rawValue)) {
        const cleanedOr = rawValue
          .map((clause) =>
            PedidosService.pruneOrderWhere(clause as Prisma.OrderWhereInput),
          )
          .filter((clause) => Object.keys(clause).length > 0);
        if (cleanedOr.length > 0) out.OR = cleanedOr;
        continue;
      }

      if (key === 'NOT') {
        const cleanedNot = PedidosService.pruneOrderWhere(
          rawValue as Prisma.OrderWhereInput,
        );
        if (Object.keys(cleanedNot).length > 0) out.NOT = cleanedNot;
        continue;
      }

      (out as Record<string, unknown>)[key] = rawValue;
    }

    return out;
  }

  private static cleanItemsRelationFilter(
    filter: Prisma.OrderItemListRelationFilter,
  ): Prisma.OrderItemListRelationFilter | undefined {
    const out: Prisma.OrderItemListRelationFilter = {};

    if (filter.some !== undefined) {
      const cleaned = PedidosService.pruneOrderItemWhere(filter.some);
      if (cleaned) out.some = cleaned;
    }
    if (filter.none !== undefined) {
      const cleaned = PedidosService.pruneOrderItemWhere(filter.none);
      if (cleaned) out.none = cleaned;
    }
    if (filter.every !== undefined) {
      const cleaned = PedidosService.pruneOrderItemWhere(filter.every);
      if (cleaned) out.every = cleaned;
    }

    return Object.keys(out).length > 0 ? out : undefined;
  }

  private static pruneOrderItemWhere(
    where: Prisma.OrderItemWhereInput,
  ): Prisma.OrderItemWhereInput | undefined {
    if (!where || typeof where !== 'object') return where;

    const out: Prisma.OrderItemWhereInput = {};

    for (const [key, rawValue] of Object.entries(where) as Array<
      [keyof Prisma.OrderItemWhereInput, unknown]
    >) {
      if (rawValue === undefined) continue;
      if (key === 'mercadoEletronicoItemStatus' || key === 'stockStatus') {
        continue;
      }

      if (key === 'AND' && Array.isArray(rawValue)) {
        const cleanedAnd = rawValue
          .map((clause) =>
            PedidosService.pruneOrderItemWhere(
              clause as Prisma.OrderItemWhereInput,
            ),
          )
          .filter(
            (clause): clause is Prisma.OrderItemWhereInput =>
              clause != null && Object.keys(clause).length > 0,
          );
        if (cleanedAnd.length > 0) out.AND = cleanedAnd;
        continue;
      }

      if (key === 'OR' && Array.isArray(rawValue)) {
        const cleanedOr = rawValue
          .map((clause) =>
            PedidosService.pruneOrderItemWhere(
              clause as Prisma.OrderItemWhereInput,
            ),
          )
          .filter(
            (clause): clause is Prisma.OrderItemWhereInput =>
              clause != null && Object.keys(clause).length > 0,
          );
        if (cleanedOr.length > 0) out.OR = cleanedOr;
        continue;
      }

      if (key === 'NOT') {
        const cleanedNot = PedidosService.pruneOrderItemWhere(
          rawValue as Prisma.OrderItemWhereInput,
        );
        if (cleanedNot && Object.keys(cleanedNot).length > 0) {
          out.NOT = cleanedNot;
        }
        continue;
      }

      (out as Record<string, unknown>)[key] = rawValue;
    }

    return Object.keys(out).length > 0 ? out : undefined;
  }

  private async listSeparationWorkspaceOrders(
    query: OrderQueryDto,
    filters: {
      search?: string;
      filterField?: string;
      filterValue?: string;
    },
  ) {
    type OrderListInternals = {
      buildOrderBy(input: OrderQueryDto): Prisma.OrderOrderByWithRelationInput[];
      serializeOrder(row: unknown): Awaited<
        ReturnType<OrderService['findMany']>
      >['data'][number];
    };

    const internals = this.orders as unknown as OrderListInternals;
    const page = query.page !== undefined && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize !== undefined &&
      query.pageSize > 0 &&
      query.pageSize <= 100
        ? query.pageSize
        : 15;

    const mode = 'insensitive' as const;
    const allowedFilterFields = new Set([
      'invoiceNumber',
      'receiverName',
      'unloadingPoint',
    ]);

    const where: Prisma.OrderWhereInput = PedidosService.stripSeparationItemVisualFilters({
      AND: [
        this.buildSeparationListWhere({
          ...query,
          search: undefined,
          filterField: undefined,
          filterValue: undefined,
        }),
        ...(filters.search
          ? [{ externalOrderNumber: { startsWith: filters.search, mode } }]
          : []),
        ...(filters.filterField &&
        filters.filterValue &&
        allowedFilterFields.has(filters.filterField)
          ? [
              {
                [filters.filterField]: {
                  contains: filters.filterValue,
                  mode,
                },
              } as Prisma.OrderWhereInput,
            ]
          : []),
      ],
    });

    const orderBy = internals.buildOrderBy(query);
    const total = await this.prisma.client.order.count({ where });
    const rows = await this.prisma.client.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: (
        OrderService as unknown as { orderInclude(): Prisma.OrderInclude }
      ).orderInclude(),
    });

    return {
      data: rows.map((row) => internals.serializeOrder(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private async listPedidosWithFilters(
    query: OrderQueryDto,
    filters: {
      search?: string;
      filterField?: string;
      filterValue?: string;
    },
  ) {
    type OrderListInternals = {
      buildWhere(input: OrderQueryDto): Prisma.OrderWhereInput;
      buildOrderBy(input: OrderQueryDto): Prisma.OrderOrderByWithRelationInput[];
      serializeOrder(row: unknown): Awaited<
        ReturnType<OrderService['findMany']>
      >['data'][number];
    };

    const internals = this.orders as unknown as OrderListInternals;
    const page = query.page !== undefined && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize !== undefined &&
      query.pageSize > 0 &&
      query.pageSize <= 100
        ? query.pageSize
        : 15;

    const baseWhere = internals.buildWhere({
      ...query,
      search: undefined,
      filterField: undefined,
      filterValue: undefined,
    });

    const mode = 'insensitive' as const;
    const allowedFilterFields = new Set([
      'invoiceNumber',
      'receiverName',
      'unloadingPoint',
    ]);

    const where: Prisma.OrderWhereInput = {
      AND: [
        baseWhere,
        ...(filters.search
          ? [{ externalOrderNumber: { startsWith: filters.search, mode } }]
          : []),
        ...(filters.filterField &&
        filters.filterValue &&
        allowedFilterFields.has(filters.filterField)
          ? [
              {
                [filters.filterField]: {
                  contains: filters.filterValue,
                  mode,
                },
              } as Prisma.OrderWhereInput,
            ]
          : []),
      ],
    };

    const orderBy = internals.buildOrderBy(query);
    const total = await this.prisma.client.order.count({ where });
    const rows = await this.prisma.client.order.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
      include: (
        OrderService as unknown as { orderInclude(): Prisma.OrderInclude }
      ).orderInclude(),
    });

    return {
      data: rows.map((row) => internals.serializeOrder(row)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  updateManual(userId: string, numeroPed: string, dto: CreateManualPedidoDto) {
    return this.orders.updateManualPedido(userId, numeroPed, dto);
  }

  async updateAdmin(userId: string, numeroPed: string, dto: UpdatePedidoAdminDto) {
    const numeroStr = numeroPed.trim();
    const before = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroStr },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!before) throw new NotFoundException('Pedido não encontrado.');

    const data: Prisma.OrderUpdateInput = {};
    if (dto.receiverName !== undefined) {
      data.receiverName = dto.receiverName.trim() || null;
    }
    if (dto.unloadingPoint !== undefined) {
      data.unloadingPoint = dto.unloadingPoint.trim() || null;
    }
    if (dto.deliveryCnpj !== undefined) {
      data.deliveryCnpj = dto.deliveryCnpj.trim() || null;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim() || null;
    }
    if (dto.obsExpedicao !== undefined) {
      data.obsExpedicao = dto.obsExpedicao.trim() || null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status as OrderStatus;
    }
    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }
    if (dto.mercadoEletronicoStatus !== undefined) {
      data.mercadoEletronicoStatus = dto.mercadoEletronicoStatus.trim() || null;
    }
    if (dto.contaAzulStatus !== undefined) {
      data.contaAzulStatus = dto.contaAzulStatus.trim() || null;
    }
    if (dto.invoiceNumber !== undefined) {
      data.invoiceNumber = dto.invoiceNumber.trim() || null;
    }
    if (dto.orderDate !== undefined && dto.orderDate.trim()) {
      data.orderDate = isoDateStringToUtcDate(dto.orderDate.trim().slice(0, 10));
    }
    if (dto.requestedDeliveryDate !== undefined && dto.requestedDeliveryDate.trim()) {
      data.requestedDeliveryDate = isoDateStringToUtcDate(
        dto.requestedDeliveryDate.trim().slice(0, 10),
      );
    }
    if (dto.totalValue !== undefined && dto.totalValue.trim()) {
      const totalDec = decimalFromStringOrZero(dto.totalValue.trim());
      data.subtotal = totalDec;
      data.total = totalDec;
      data.totalValue = totalDec;
    }
    if (dto.carrierId !== undefined) {
      (data as Prisma.OrderUpdateInput & { carrierId?: string | null }).carrierId =
        dto.carrierId;
    }

    await this.prisma.client.$transaction(async (tx) => {
      await tx.order.update({ where: { id: before.id }, data });

      if (dto.items?.length) {
        for (const item of dto.items) {
          const itemData: Prisma.OrderItemUpdateInput = {};
          if (item.lineNumber !== undefined) itemData.lineNumber = item.lineNumber;
          if (item.sku !== undefined) itemData.sku = item.sku.trim();
          if (item.description !== undefined) {
            itemData.description = item.description.trim();
          }
          if (item.quantity !== undefined) itemData.quantity = item.quantity;
          if (item.mercadoEletronicoItemStatus !== undefined) {
            itemData.mercadoEletronicoItemStatus =
              normalizePlanilhaItemStatus(item.mercadoEletronicoItemStatus);
          }
          if (Object.keys(itemData).length === 0) continue;
          await tx.orderItem.update({ where: { id: item.id }, data: itemData });
        }
      }
    });

    const after = await this.prisma.client.order.findFirst({
      where: { id: before.id },
      include: { items: { orderBy: { lineNumber: 'asc' } } },
    });

    await this.audit.log({
      userId,
      action: 'ORDER_ADMIN_UPDATED',
      entity: 'Order',
      entityId: before.id,
      changes: {
        externalOrderNumber: numeroStr,
        source: before.source,
        before: {
          receiverName: before.receiverName,
          unloadingPoint: before.unloadingPoint,
          deliveryCnpj: before.deliveryCnpj,
          status: before.status,
          priority: before.priority,
          notes: before.notes,
          obsExpedicao: before.obsExpedicao,
          mercadoEletronicoStatus: before.mercadoEletronicoStatus,
          contaAzulStatus: before.contaAzulStatus,
          invoiceNumber: before.invoiceNumber,
          orderDate: before.orderDate?.toISOString() ?? null,
          requestedDeliveryDate: before.requestedDeliveryDate?.toISOString() ?? null,
          totalValue: before.totalValue.toString(),
          items: before.items.map((it) => ({
            id: it.id,
            lineNumber: it.lineNumber,
            sku: it.sku,
            quantity: it.quantity,
            mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus,
          })),
        },
        after: after
          ? {
              receiverName: after.receiverName,
              unloadingPoint: after.unloadingPoint,
              deliveryCnpj: after.deliveryCnpj,
              status: after.status,
              priority: after.priority,
              notes: after.notes,
              obsExpedicao: after.obsExpedicao,
              mercadoEletronicoStatus: after.mercadoEletronicoStatus,
              contaAzulStatus: after.contaAzulStatus,
              invoiceNumber: after.invoiceNumber,
              orderDate: after.orderDate?.toISOString() ?? null,
              requestedDeliveryDate: after.requestedDeliveryDate?.toISOString() ?? null,
              totalValue: after.totalValue.toString(),
              items: after.items.map((it) => ({
                id: it.id,
                lineNumber: it.lineNumber,
                sku: it.sku,
                quantity: it.quantity,
                mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus,
              })),
            }
          : null,
      },
    });

    return this.findByNumeroPed(numeroPed);
  }

  async deleteManual(userId: string, numeroPed: string) {
    const numeroStr = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroStr },
      include: { items: true, exits: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    let purgeSummary: Awaited<ReturnType<StockService['purgeOrderRelatedData']>>;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${EXPEDITION_STOCK_LOCK})`,
      );
      purgeSummary = await this.stock.purgeOrderRelatedData(tx, {
        id: order.id,
        code: order.code,
        externalOrderNumber: order.externalOrderNumber,
        invoiceNumber: order.invoiceNumber,
      });
      await tx.order.delete({ where: { id: order.id } });
    });

    await this.audit.log({
      userId,
      action: 'ORDER_DELETED',
      entity: 'Order',
      entityId: order.id,
      changes: {
        code: order.code,
        externalOrderNumber: numeroStr,
        source: order.source,
        status: order.status,
        stockCleanup: purgeSummary!,
      },
    });

    return { ok: true };
  }

  private normalizeInvoiceNumberDigits(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    let part = trimmed.split('/')[0]?.trim() ?? trimmed;
    const dashMatch = part.match(/[-–—]\s*(.+)$/);
    if (dashMatch?.[1]) {
      part = dashMatch[1].trim();
    }
    return part.replace(/\D/g, '');
  }

  private readInvoiceNumber(dto: PedidosAttachNfDto): string {
    const raw = (dto.invoiceNumber ?? dto.nota_fiscal ?? '').trim();
    if (!raw) return '';
    return this.normalizeInvoiceNumberDigits(raw);
  }

  private async nextOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${NEXT_CODE_ADVISORY_LOCK})`,
    );
    const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
      SELECT (COALESCE(MAX(CAST(SPLIT_PART("code", '-', 2) AS INTEGER)), 0) + 1)::bigint AS next
      FROM "Order"
      WHERE "code" ~ '^PED-[0-9]+$'
    `;
    const n = Number(rows[0]?.next ?? 1);
    return `PED-${String(n).padStart(6, '0')}`;
  }

  async findByNumeroPed(numeroPed: string) {
    const externalOrderNumber = numeroPed.trim();
    if (!externalOrderNumber) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    const res = await this.orders.findMany({
      externalOrderNumber,
      page: 1,
      pageSize: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    } as never);
    const first = res?.data?.[0];
    if (!first) throw new NotFoundException('Pedido não encontrado.');
    return first;
  }

  async listItems(numeroPed: string) {
    const externalOrderNumber = numeroPed.trim();
    if (!externalOrderNumber) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    const order = await this.prisma.client.order.findFirst({
      where: {
        externalOrderNumber,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return this.prisma.client.orderItem.findMany({
      where: { orderId: order.id },
      orderBy: { lineNumber: 'asc' },
    });
  }

  async removeFromSeparation(numeroPed: string, userId: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return this.orders.removeFromSeparation(order.id, userId);
  }

  async updateStatuses(numeroPed: string, dto: PedidosUpdateStatusDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (dto.status !== undefined && dto.status.trim()) {
      return this.orders.updateStatusManual(order.id, userId, {
        status: dto.status.trim(),
      });
    }

    const data: Prisma.OrderUpdateInput = {};
    if (dto.status_me !== undefined) {
      data.mercadoEletronicoStatus = dto.status_me.trim() || null;
    }
    if (dto.status_ca !== undefined) {
      data.contaAzulStatus = dto.status_ca.trim() || null;
    }
    if (dto.obsExpedicao !== undefined) {
      data.obsExpedicao = dto.obsExpedicao.trim() || null;
    }
    if (dto.notaRemessa !== undefined) {
      data.notaRemessa = dto.notaRemessa.trim() || null;
    }
    if (dto.invoiceNumber !== undefined) {
      data.invoiceNumber = dto.invoiceNumber.trim() || null;
    }
    if (dto.notaRemessaConfirmada !== undefined) {
      (data as Prisma.OrderUpdateInput & { notaRemessaConfirmada?: boolean }).notaRemessaConfirmada =
        dto.notaRemessaConfirmada;
    }
    if (dto.volumes !== undefined) {
      (data as Prisma.OrderUpdateInput & { volumes?: number }).volumes = dto.volumes;
    }
    return this.prisma.client.order.update({
      where: { id: order.id },
      data,
    });
  }

  async updatePriority(
    numeroPed: string,
    dto: UpdateOrderPriorityDto,
    userId: string,
  ) {
    const order = await this.findByNumeroPed(numeroPed);
    return this.orders.updatePriority(order.id, userId, dto);
  }

  async updateCarrier(numeroPed: string, carrierId: string | null, userId: string) {
    const order = await this.findByNumeroPed(numeroPed);
    return this.orders.updateOrderCarrier(order.id, userId, carrierId);
  }

  async updateVolumes(numeroPed: string, volumes: number, _userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (
      order.status === OrderStatus.FINALIZADO ||
      order.status === OrderStatus.EXPEDIDO
    ) {
      throw new BadRequestException(
        'Volumes não podem ser alterados em pedido finalizado.',
      );
    }

    return this.prisma.client.order.update({
      where: { id: order.id },
      data: { volumes },
    });
  }

  async updateRastreio(numeroPed: string, trackingCode: string) {
    const trimmedNumero = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [
          { externalOrderNumber: trimmedNumero },
          { code: trimmedNumero },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const code = trackingCode.trim() || null;

    const exit = await this.prisma.client.orderExit.findUnique({
      where: { orderId: order.id },
      select: { id: true },
    });

    if (exit) {
      await this.prisma.client.orderExit.update({
        where: { id: exit.id },
        data: { trackingCode: code },
      });
    } else {
      await this.prisma.client.order.update({
        where: { id: order.id },
        data: { trackingCode: code },
      });
    }

    return this.orders.findOne(order.id);
  }

  async gerarEtiquetaCorreios(
    numeroPed: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        carrier: { select: { name: true } },
        items: { select: { description: true, sku: true }, take: 5 },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const pedidoNum =
      order.externalOrderNumber?.trim() || order.code?.trim() || trimmed;
    const filename =
      `correios-${pedidoNum}`.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_') ||
      'correios-pedido';

    const exit = await this.prisma.client.orderExit.findUnique({
      where: { orderId: order.id },
      select: { id: true, trackingCode: true },
    });
    const trackingExistente =
      exit?.trackingCode?.trim() || order.trackingCode?.trim() || '';

    if (trackingExistente) {
      const prePostagemExistente =
        await this.correiosService.buscarPrePostagemPorCodigoObjeto(
          trackingExistente,
        );
      const prePostagemId =
        typeof prePostagemExistente?.id === 'string'
          ? prePostagemExistente.id
          : null;
      const podeReimprimir =
        prePostagemExistente?.statusAtual === 2 ||
        prePostagemExistente?.descStatusAtual === 'Pré-postado';

      if (prePostagemId && podeReimprimir) {
        const buffer = await this.correiosService.gerarRotulo([prePostagemId]);
        return { buffer, filename };
      }
    }

    const carrierName = order.carrier?.name ?? '';
    const codigoServico = this.mapCarrierToCorreiosService(carrierName);
    const remetente = await this.buildRemetenteCorreios();
    const destinatario = this.parseDestinatarioFromOrder(order);
    const descricaoConteudo =
      order.items
        .map((item) => item.description?.trim() || item.sku?.trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 200) || 'Mercadorias';

    const prePostagem = await this.correiosService.criarPrePostagem({
      remetente,
      destinatario,
      numeroNotaFiscal: order.invoiceNumber?.trim() || undefined,
      objeto: {
        codigoServico,
        pesoGramas: 0,
        comprimento: 0,
        largura: 0,
        altura: 0,
        descricaoConteudo,
      },
    });

    const prePostagemId =
      prePostagem?.id ?? prePostagem?.idPrePostagem ?? prePostagem?.idRecibo;
    if (!prePostagemId) {
      throw new BadRequestException(
        'Correios não retornou o ID da pré-postagem.',
      );
    }

    const buffer = await this.correiosService.gerarRotulo([String(prePostagemId)]);

    const codigoRastreio =
      typeof prePostagem?.codigoObjeto === 'string'
        ? prePostagem.codigoObjeto.trim()
        : '';
    if (codigoRastreio) {
      if (exit) {
        await this.prisma.client.orderExit.update({
          where: { id: exit.id },
          data: { trackingCode: codigoRastreio },
        });
      } else {
        await this.prisma.client.order.update({
          where: { id: order.id },
          data: { trackingCode: codigoRastreio },
        });
      }
    }

    return { buffer, filename };
  }

  async cancelarEtiquetaCorreios(numeroPed: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        carrier: { select: { name: true } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    this.mapCarrierToCorreiosService(order.carrier?.name ?? '');

    const exit = await this.prisma.client.orderExit.findUnique({
      where: { orderId: order.id },
      select: { id: true, trackingCode: true },
    });

    const trackingCode =
      exit?.trackingCode?.trim() || order.trackingCode?.trim() || '';
    if (!trackingCode) {
      throw new BadRequestException(
        'Pedido sem etiqueta Correios para cancelar.',
      );
    }

    const prePostagem =
      await this.correiosService.buscarPrePostagemPorCodigoObjeto(trackingCode);
    const prePostagemId =
      typeof prePostagem?.id === 'string' ? prePostagem.id : null;
    if (!prePostagemId) {
      throw new NotFoundException(
        'Pré-postagem não encontrada nos Correios para este rastreio.',
      );
    }

    await this.correiosService.cancelarPrePostagem(prePostagemId);

    if (exit) {
      await this.prisma.client.orderExit.update({
        where: { id: exit.id },
        data: { trackingCode: null },
      });
    } else {
      await this.prisma.client.order.update({
        where: { id: order.id },
        data: { trackingCode: null },
      });
    }

    return {
      ok: true,
      message: 'Etiqueta Correios cancelada com sucesso.',
      codigoObjeto: trackingCode,
    };
  }

  private mapCarrierToCorreiosService(carrierName: string): string {
    const upper = carrierName.toUpperCase();
    if (upper.includes('MINI ENVIOS')) {
      return this.config.get<string>('CORREIOS_CODIGO_MINI_ENVIOS') ?? '04227';
    }
    if (upper.includes('SEDEX')) {
      return this.config.get<string>('CORREIOS_CODIGO_SEDEX') ?? '03220';
    }
    if (upper.includes('PAC')) {
      return this.config.get<string>('CORREIOS_CODIGO_PAC') ?? '03298';
    }
    throw new BadRequestException(
      'Transportadora não suportada para etiqueta Correios. Use PAC, SEDEX ou MINI ENVIOS.',
    );
  }

  private async buildRemetenteCorreios() {
    const cep = (this.config.get<string>('CORREIOS_CEP_ORIGEM') ?? '').replace(
      /\D/g,
      '',
    );
    if (cep.length !== 8) {
      throw new BadRequestException('CORREIOS_CEP_ORIGEM inválido ou ausente.');
    }

    let cepData: Record<string, string> = {};
    try {
      cepData = (await this.correiosService.buscarCep(cep)) as Record<
        string,
        string
      >;
    } catch {
      /* usa fallback abaixo */
    }

    return {
      nome: 'Energy Brands',
      cpfCnpj: this.config.get<string>('CORREIOS_USUARIO') ?? '',
      cep,
      logradouro: cepData.logradouro ?? cepData.end ?? 'Endereço remetente',
      numero: 'S/N',
      bairro: cepData.bairro ?? '',
      cidade: cepData.localidade ?? cepData.cidade ?? '',
      uf: cepData.uf ?? '',
    };
  }

  private parseDestinatarioFromOrder(order: {
    receiverName: string | null;
    customerName: string;
    customerDocument: string | null;
    deliveryCnpj: string | null;
    deliveryAddress: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    unloadingPoint: string | null;
  }) {
    const nome =
      order.receiverName?.trim() || order.customerName?.trim() || 'Destinatário';
    const cpfCnpj =
      order.customerDocument?.replace(/\D/g, '') ||
      order.deliveryCnpj?.replace(/\D/g, '') ||
      '';

    const structured =
      parseStoredDeliveryAddress(order.deliveryAddress) ??
      parseStoredDeliveryAddress(order.unloadingPoint);
    if (structured) {
      return {
        nome,
        cpfCnpj,
        cep: structured.cep,
        logradouro: structured.logradouro,
        numero: structured.numero,
        complemento: structured.complemento,
        bairro: structured.bairro,
        cidade: structured.cidade,
        uf: structured.uf,
      };
    }

    const addressRaw =
      order.deliveryAddress?.trim() || order.unloadingPoint?.trim() || '';

    const cepMatch = addressRaw.match(/CEP\s*([\d.-]+)/i);
    const cep = cepMatch?.[1]?.replace(/\D/g, '') ?? '';
    if (cep.length !== 8) {
      throw new BadRequestException(
        'Pedido sem CEP do destinatário para etiqueta Correios.',
      );
    }

    const withoutCep = addressRaw.replace(/\s*-\s*CEP\s*[\d.-]+/i, '').trim();
    const segments = withoutCep
      .split(' - ')
      .map((segment) => segment.trim())
      .filter(Boolean);

    let cidade = order.deliveryCity?.trim() ?? '';
    let uf = order.deliveryState?.trim().toUpperCase() ?? '';
    let logradouro = '';
    let numero = 'S/N';
    let complemento = '';
    let bairro = '';

    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      const cityState = last.match(/^(.+)\/([A-Za-z]{2})$/);
      if (cityState) {
        if (!cidade) cidade = cityState[1].trim();
        if (!uf) uf = cityState[2].trim().toUpperCase();
        segments.pop();
      }
    }

    if (segments[0]) {
      const streetParts = segments[0].split(',').map((part) => part.trim());
      logradouro = streetParts[0] ?? '';
      if (streetParts[1]) numero = streetParts[1];
    }
    if (segments.length >= 3) {
      complemento = segments[1] ?? '';
      bairro = segments.slice(2).join(' - ');
    } else if (segments[1]) {
      bairro = segments[1];
    }

    if (!logradouro || !cidade || !uf) {
      throw new BadRequestException(
        'Endereço do destinatário incompleto para etiqueta Correios.',
      );
    }

    return {
      nome,
      cpfCnpj,
      cep,
      logradouro,
      numero,
      complemento,
      bairro,
      cidade,
      uf,
    };
  }

  async gerarEtiquetaPdf(
    numeroPed: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        carrier: { select: { name: true } },
        items: { select: { sku: true, description: true, quantity: true } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const totalVolumes =
      order.volumes != null && order.volumes >= 1 ? order.volumes : 1;
    const pedidoNum =
      order.externalOrderNumber?.trim() || order.code?.trim() || trimmed;
    const receiver = order.receiverName?.trim() || '—';
    const unloading = order.unloadingPoint?.trim() || '—';
    const nf = order.invoiceNumber?.trim() || '—';

    const CM = 72 / 2.54;
    const labelW = 10 * CM;
    const labelH = 6 * CM;
    const pad = 12;
    const innerW = labelW - pad * 2;

    const doc = new PDFDocument({ autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (let vol = 1; vol <= totalVolumes; vol++) {
        doc.addPage({ size: [labelW, labelH], margin: 0 });

        let y = pad;

        doc
          .fontSize(15)
          .font('Helvetica-Bold')
          .text('DESTINATÁRIO', pad, y, { width: innerW, lineBreak: false });
        y += 22;

        doc.fontSize(11).font('Helvetica-Bold').text('Pedido: ', pad, y, {
          continued: true,
          lineBreak: false,
        });
        doc.font('Helvetica').text(pedidoNum, { lineBreak: false });

        const nfText = `NF: ${nf}`;
        doc.fontSize(13).font('Helvetica-Bold');
        const nfW = doc.widthOfString(nfText);
        doc.text(nfText, labelW - pad - nfW, y - 1, { lineBreak: false });
        y += 20;

        doc.fontSize(11).font('Helvetica-Bold').text('Recebedor:', pad, y, {
          width: innerW,
          lineBreak: false,
        });
        y += 14;
        doc.fontSize(16).font('Helvetica-Bold').text(receiver, pad, y, {
          width: innerW,
          lineBreak: false,
        });
        y += 22;

        doc.fontSize(11).font('Helvetica-Bold').text('Ponto de descarga:', pad, y, {
          width: innerW,
          lineBreak: false,
        });
        y += 14;
        doc.fontSize(15).font('Helvetica-Bold').text(unloading, pad, y, {
          width: innerW,
          height: labelH - y - 28,
        });

        const volY = labelH - pad - 22;
        doc
          .fontSize(20)
          .font('Helvetica-Bold')
          .text(`VOLUMES: ${vol}/${totalVolumes}`, pad, volY, {
            width: innerW,
            align: 'center',
            lineBreak: false,
          });
      }

      doc.end();
    });

    return {
      buffer,
      filename: pedidoNum.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_') || 'pedido',
    };
  }

  async gerarRomaneioPdf(orderIds: string[]): Promise<Buffer> {
    const uniqueIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('Informe ao menos um pedido.');
    }

    const orders = await this.prisma.client.order.findMany({
      where: { id: { in: uniqueIds } },
      include: {
        carrier: { select: { name: true } },
        items: { select: { sku: true, description: true, quantity: true } },
      },
    });

    if (orders.length === 0) {
      throw new NotFoundException('Nenhum pedido encontrado.');
    }

    const byId = new Map(orders.map((order) => [order.id, order]));
    const rows = uniqueIds
      .map((id) => byId.get(id))
      .filter((order): order is (typeof orders)[number] => order != null);

    const todayLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;
      const colWidths = [pageWidth * 0.7, pageWidth * 0.3];
      const colX = [left, left + colWidths[0]];
      const headers = ['Nota Fiscal', 'Volumes'];

      const drawHeader = (startY: number) => {
        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .text('ROMANEIO DE COLETA — Energy Brands', left, startY, {
            width: pageWidth,
            align: 'center',
          });
        doc
          .fontSize(11)
          .font('Helvetica')
          .text(`Data atual: ${todayLabel}`, left, startY + 24, {
            width: pageWidth,
            align: 'center',
          });
        doc.text('Transportadora: São Miguel', left, startY + 42, {
          width: pageWidth,
          align: 'center',
        });
        return startY + 72;
      };

      const drawTableHeader = (y: number) => {
        doc.fontSize(10).font('Helvetica-Bold');
        headers.forEach((header, index) => {
          doc.text(header, colX[index], y, {
            width: colWidths[index] - 4,
            lineBreak: false,
          });
        });
        const lineY = y + 16;
        doc.moveTo(left, lineY).lineTo(left + pageWidth, lineY).stroke();
        return lineY + 10;
      };

      const drawFooter = () => {
        const footerY = doc.page.height - doc.page.margins.bottom - 30;
        doc.fontSize(10).font('Helvetica');
        doc.text(
          'Assinatura do coletador: ___________________________',
          left,
          footerY,
        );
      };

      let y = drawHeader(50);
      y = drawTableHeader(y);

      for (const order of rows) {
        if (y > doc.page.height - doc.page.margins.bottom - 70) {
          drawFooter();
          doc.addPage();
          y = drawTableHeader(doc.page.margins.top);
        }

        const invoiceNumber = order.invoiceNumber?.trim() || '—';
        const volumes =
          order.volumes != null && order.volumes >= 1
            ? String(order.volumes)
            : '—';
        const values = [invoiceNumber, volumes];

        doc.fontSize(10).font('Helvetica');
        const rowHeight = Math.max(
          ...values.map((value, index) =>
            doc.heightOfString(value, { width: colWidths[index] - 4 }),
          ),
          14,
        );

        values.forEach((value, index) => {
          doc.text(value, colX[index], y, {
            width: colWidths[index] - 4,
          });
        });
        y += rowHeight + 8;
      }

      drawFooter();
      doc.end();
    });

    const now = new Date();
    await this.prisma.client.orderExit.updateMany({
      where: { orderId: { in: uniqueIds } },
      data: {
        romaneioAt: now,
      } as unknown as Prisma.OrderExitUpdateManyMutationInput,
    });

    return buffer;
  }

  async attachNf(numeroPed: string, dto: PedidosAttachNfDto, userId: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    const nf = this.readInvoiceNumber(dto);
    if (!nf) {
      throw new BadRequestException('Informe o número da NF-e.');
    }
    if (!/^\d{1,9}$/.test(nf)) {
      throw new BadRequestException('NF-e deve ter de 1 a 9 dígitos numéricos.');
    }
    return this.orders.attachInvoice(order.id, userId, { invoiceNumber: nf });
  }

  async gerarNfFlask(numeroPed: string, userId: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      include: {
        items: {
          orderBy: { lineNumber: 'asc' },
          include: {
            product: { select: { sku: true, name: true } },
          },
        },
        carrier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (
      order.status === OrderStatus.FINALIZADO ||
      order.status === OrderStatus.EXPEDIDO
    ) {
      throw new BadRequestException(
        'Pedido finalizado. Não é possível gerar nova NF.',
      );
    }

    const fullyInvoiced =
      order.items.length > 0 &&
      order.items.every(
        (it) => it.quantity <= 0 || (it.invoicedQty ?? 0) >= it.quantity,
      );
    if (fullyInvoiced) {
      throw new BadRequestException(
        'Pedido já está totalmente faturado. Não é possível gerar nova NF.',
      );
    }

    const numeroPedRef = order.externalOrderNumber?.trim() || order.code;
    const estado =
      order.deliveryState?.trim().toUpperCase() ||
      parseStoredDeliveryAddress(order.deliveryAddress)?.uf ||
      parseStoredDeliveryAddress(order.unloadingPoint)?.uf ||
      null;
    const payload = {
      pedidos: [
        {
          numeroPed: numeroPedRef,
          cnpj: order.deliveryCnpj ?? '',
          itens: order.items
            .map((item) => ({
              seq: item.lineNumber,
              sku: item.product?.sku ?? item.sku,
              nome: item.product?.name ?? item.description,
              quantidade: item.pickedQty > 0 ? item.pickedQty : item.quantity,
            }))
            .filter((item) => item.quantidade > 0),
          pontoDescarga: order.unloadingPoint ?? '',
          recebedor: order.receiverName ?? '',
          volume: order.volumes != null ? String(order.volumes) : '',
          transportadora: order.carrier?.name ?? null,
          estado,
        },
      ],
    };

    let resultado: unknown;
    try {
      const FLASK_URL = process.env.FLASK_NF_URL || 'http://localhost:5000';
      const { data } = await axios.post(`${FLASK_URL}/emitir-nf`, payload, {
        headers: { 'Content-Type': 'application/json' },
      });
      resultado = data;
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && error.response?.data
          ? JSON.stringify(error.response.data).slice(0, 300)
          : error instanceof Error
            ? error.message
            : 'Falha ao chamar robô Flask';
      throw new InternalServerErrorException(`Erro ao emitir NF: ${message}`);
    }

    const parsed = parseNfFlaskResult(numeroPedRef, resultado);
    const numeroNF =
      parsed.ok
        ? parsed.numeroNota
        : (() => {
            if (!resultado || typeof resultado !== 'object') return null;
            const row = resultado as Record<string, unknown>;
            if (row.numeroNF != null) return String(row.numeroNF);
            const sucesso = Array.isArray(row.sucesso) ? row.sucesso[0] : null;
            if (sucesso && typeof sucesso === 'object') {
              const s = sucesso as Record<string, unknown>;
              if (s.numeroNF != null) return String(s.numeroNF);
              if (s.nota != null) return String(s.nota);
            }
            return null;
          })();

    if (!numeroNF) {
      const erro =
        !parsed.ok && 'erro' in parsed
          ? parsed.erro
          : 'Robô Flask não retornou número da NF';
      throw new InternalServerErrorException(`Erro ao emitir NF: ${erro}`);
    }

    // Apenas atrela NF (status NF_ATRELADA). Saída de estoque só via POST /saida após etiqueta.
    const updated = await this.orders.attachInvoice(order.id, userId, {
      invoiceNumber: numeroNF,
    });

    return {
      success: true,
      numeroPed: trimmed,
      numeroNF,
      resultado,
      order: updated,
    };
  }

  async listNfHistorico(numeroPed: string) {
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [
          { externalOrderNumber: numeroPed.trim() },
          { code: numeroPed.trim() },
        ],
      },
      select: { id: true, invoiceNumber: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const rows = await this.prisma.client.orderInvoiceHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      orderId: order.id,
      currentInvoiceNumber: order.invoiceNumber,
      historico: rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        pickedQtyAtTime: row.pickedQtyAtTime,
        createdAt: row.createdAt.toISOString(),
        createdBy: row.createdBy,
      })),
    };
  }

  /**
   * Recalcula invoicedQty por item a partir do histórico restante.
   * Sem histórico → 0 em todos. Com histórico → redistribui a soma das
   * quantidades (pickedQtyAtTime) das NFs restantes, respeitando quantity.
   */
  private async recalculateInvoicedQtyFromHistory(orderId: string): Promise<void> {
    const history = await this.prisma.client.orderInvoiceHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: { pickedQtyAtTime: true },
    });

    const items = await this.prisma.client.orderItem.findMany({
      where: { orderId },
      orderBy: { lineNumber: 'asc' },
      select: { id: true, quantity: true, invoicedQty: true },
    });

    if (items.length === 0) return;

    if (history.length === 0) {
      // updateMany + update individual garantem persistência mesmo se algum
      // item já estiver com valor residual de ciclo anterior.
      await this.prisma.client.orderItem.updateMany({
        where: { orderId },
        data: { invoicedQty: 0 },
      });
      for (const it of items) {
        if ((it.invoicedQty ?? 0) !== 0) {
          await this.prisma.client.orderItem.update({
            where: { id: it.id },
            data: { invoicedQty: 0 },
          });
        }
      }
      return;
    }

    // Deltas: pickedQtyAtTime é cumulativo no momento da NF; a contribuição
    // de cada entrada é o acréscimo vs. a anterior (mín. 0).
    let prevCum = 0;
    let remainingUnits = 0;
    for (const row of history) {
      const cum = Math.max(0, row.pickedQtyAtTime ?? 0);
      remainingUnits += Math.max(0, cum - prevCum);
      prevCum = Math.max(prevCum, cum);
    }

    if (remainingUnits <= 0) {
      await this.prisma.client.orderItem.updateMany({
        where: { orderId },
        data: { invoicedQty: 0 },
      });
      for (const it of items) {
        if ((it.invoicedQty ?? 0) !== 0) {
          await this.prisma.client.orderItem.update({
            where: { id: it.id },
            data: { invoicedQty: 0 },
          });
        }
      }
      return;
    }

    const currentSum = items.reduce(
      (sum, it) => sum + Math.max(0, it.invoicedQty ?? 0),
      0,
    );

    const targets: Array<{ id: string; invoicedQty: number }> = [];

    if (currentSum <= 0) {
      let left = remainingUnits;
      for (const it of items) {
        const take = Math.min(Math.max(0, it.quantity), left);
        targets.push({ id: it.id, invoicedQty: take });
        left -= take;
      }
    } else {
      let assigned = 0;
      for (let i = 0; i < items.length; i += 1) {
        const it = items[i]!;
        let take: number;
        if (i === items.length - 1) {
          take = Math.max(0, remainingUnits - assigned);
        } else {
          take = Math.floor(
            (Math.max(0, it.invoicedQty ?? 0) / currentSum) * remainingUnits,
          );
        }
        take = Math.min(Math.max(0, it.quantity), Math.max(0, take));
        targets.push({ id: it.id, invoicedQty: take });
        assigned += take;
      }
      // Ajuste residual se floor deixou sobras e ainda há capacidade.
      let leftover = remainingUnits - assigned;
      if (leftover > 0) {
        for (const t of targets) {
          if (leftover <= 0) break;
          const item = items.find((it) => it.id === t.id);
          if (!item) continue;
          const room = Math.max(0, item.quantity - t.invoicedQty);
          const add = Math.min(room, leftover);
          t.invoicedQty += add;
          leftover -= add;
        }
      }
    }

    for (const t of targets) {
      await this.prisma.client.orderItem.update({
        where: { id: t.id },
        data: { invoicedQty: t.invoicedQty },
      });
    }
  }

  async deleteNfHistoricoItem(numeroPed: string, historyId: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      select: { id: true, invoiceNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (
      order.status === OrderStatus.FINALIZADO ||
      order.status === OrderStatus.EXPEDIDO
    ) {
      throw new BadRequestException(
        'Pedido finalizado. Não é possível alterar o histórico de NFs.',
      );
    }

    const row = await this.prisma.client.orderInvoiceHistory.findFirst({
      where: { id: historyId, orderId: order.id },
    });
    if (!row) throw new NotFoundException('Registro de NF não encontrado.');

    await this.prisma.client.orderInvoiceHistory.delete({
      where: { id: row.id },
    });

    await this.recalculateInvoicedQtyFromHistory(order.id);

    // Garante persistência: sem histórico, nenhum item pode ficar faturado.
    const historyLeft = await this.prisma.client.orderInvoiceHistory.count({
      where: { orderId: order.id },
    });
    if (historyLeft === 0) {
      await this.prisma.client.orderItem.updateMany({
        where: { orderId: order.id, invoicedQty: { gt: 0 } },
        data: { invoicedQty: 0 },
      });
    }

    const deletedInvoice = row.invoiceNumber.trim();
    const current = order.invoiceNumber?.trim() || null;
    let currentInvoiceNumber = order.invoiceNumber;
    if (current && current === deletedInvoice) {
      const updated = await this.prisma.client.order.update({
        where: { id: order.id },
        data: {
          invoiceNumber: null,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          invoicedAt: null,
        },
        select: { invoiceNumber: true },
      });
      currentInvoiceNumber = updated.invoiceNumber;
    }

    const rows = await this.prisma.client.orderInvoiceHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      orderId: order.id,
      currentInvoiceNumber,
      historico: rows.map((r) => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        pickedQtyAtTime: r.pickedQtyAtTime,
        createdAt: r.createdAt.toISOString(),
        createdBy: r.createdBy,
      })),
    };
  }

  async clearNfHistorico(numeroPed: string) {
    const trimmed = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: {
        OR: [{ externalOrderNumber: trimmed }, { code: trimmed }],
      },
      select: { id: true, invoiceNumber: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (
      order.status === OrderStatus.FINALIZADO ||
      order.status === OrderStatus.EXPEDIDO
    ) {
      throw new BadRequestException(
        'Pedido finalizado. Não é possível alterar o histórico de NFs.',
      );
    }

    await this.prisma.client.orderInvoiceHistory.deleteMany({
      where: { orderId: order.id },
    });

    await this.recalculateInvoicedQtyFromHistory(order.id);

    await this.prisma.client.orderItem.updateMany({
      where: { orderId: order.id, invoicedQty: { gt: 0 } },
      data: { invoicedQty: 0 },
    });

    const current = order.invoiceNumber?.trim() || null;
    let currentInvoiceNumber = order.invoiceNumber;
    // Limpa Nota de Venda ao zerar histórico (testes / recomeço do ciclo).
    if (current) {
      const updated = await this.prisma.client.order.update({
        where: { id: order.id },
        data: {
          invoiceNumber: null,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          invoicedAt: null,
        },
        select: { invoiceNumber: true },
      });
      currentInvoiceNumber = updated.invoiceNumber;
    }

    return {
      orderId: order.id,
      currentInvoiceNumber,
      historico: [] as Array<{
        id: string;
        invoiceNumber: string;
        pickedQtyAtTime: number;
        createdAt: string;
        createdBy: string | null;
      }>,
    };
  }

  async gerarSaidaComNf(numeroPed: string, dto: PedidosAttachNfDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      select: { id: true, notaRemessa: true, notaRemessaConfirmada: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    let nf = this.readInvoiceNumber(dto);
    if (!nf) {
      const remessa = order.notaRemessa?.trim();
      if (remessa) {
        nf = this.normalizeInvoiceNumberDigits(remessa) || remessa;
      }
    }
    if (!nf) {
      throw new BadRequestException(
        'Informe a Nota de Venda ou preencha a Nota de Remessa no pedido.',
      );
    }
    const fromDto = Boolean(this.readInvoiceNumber(dto));
    if (fromDto && !/^\d{1,9}$/.test(nf)) {
      throw new BadRequestException('NF-e deve ter de 1 a 9 dígitos numéricos.');
    }
    return this.orders.generateExitFromInvoice(order.id, userId, { invoiceNumber: nf });
  }

  async salvarSeparacao(numeroPed: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          select: { quantity: true, pickedQty: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const resumo = order.items.reduce(
      (acc, it) => {
        const picked = it.pickedQty ?? 0;
        if (picked >= it.quantity && it.quantity > 0) acc.completos += 1;
        else if (picked > 0) acc.parciais += 1;
        else acc.pendentes += 1;
        return acc;
      },
      { completos: 0, parciais: 0, pendentes: 0 },
    );

    return {
      ok: true,
      pedido: numeroPed.trim(),
      status: order.status,
      itens: {
        total: order.items.length,
        ...resumo,
      },
      savedAt: new Date().toISOString(),
    };
  }

  async listSaidas(params: {
    search?: string;
    period?: 'all' | 'today' | 'week' | 'month';
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page && params.page > 0 ? params.page : 1;
    const pageSize =
      params.pageSize && params.pageSize > 0 && params.pageSize <= 100
        ? params.pageSize
        : 25;
    const search = params.search?.trim();
    const period = params.period ?? 'all';

    const where: Prisma.OrderExitWhereInput = {};
    if (search) {
      where.OR = [
        {
          order: {
            externalOrderNumber: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          order: {
            code: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          order: {
            receiverName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          order: {
            customerName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          invoiceNumber: {
            contains: search,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          order: {
            carrier: {
              name: {
                contains: search,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
      ];
    }

    const now = new Date();
    if (period !== 'all') {
      let gte: Date;
      if (period === 'today') {
        gte = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (period === 'week') {
        const day = now.getDay();
        const offset = day === 0 ? 6 : day - 1;
        gte = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      } else {
        gte = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      where.exitDate = { gte };
    }

    const total = await this.prisma.client.orderExit.count({ where });
    const rows = await this.prisma.client.orderExit.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { exitDate: 'desc' },
      include: {
        order: {
          include: {
            carrier: { select: { id: true, name: true } },
            items: { orderBy: { lineNumber: 'asc' } },
          },
        },
      },
    });

    return {
      data: rows.map((r) => this.serializeOrderExit(r)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findSaidaById(id: string) {
    const row = await this.prisma.client.orderExit.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            carrier: { select: { id: true, name: true } },
            items: { orderBy: { lineNumber: 'asc' } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Saída não encontrada.');
    return this.serializeOrderExit(row);
  }

  async deleteSaida(userId: string, exitId: string) {
    const exit = await this.prisma.client.orderExit.findUnique({
      where: { id: exitId },
      include: { order: true },
    });
    if (!exit) throw new NotFoundException('Saída não encontrada.');

    let cleanup: Awaited<ReturnType<StockService['purgeExitRelatedData']>>;

    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${EXPEDITION_STOCK_LOCK})`,
      );
      cleanup = await this.stock.purgeExitRelatedData(tx, {
        exitId: exit.id,
        invoiceNumber: exit.invoiceNumber,
        order: {
          id: exit.order.id,
          code: exit.order.code,
          externalOrderNumber: exit.order.externalOrderNumber,
          invoiceNumber: exit.order.invoiceNumber,
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'ORDER_EXIT_DELETED',
      entity: 'OrderExit',
      entityId: exit.id,
      changes: {
        invoiceNumber: exit.invoiceNumber,
        orderId: exit.orderId,
        orderCode: exit.order.code,
        stockCleanup: cleanup!,
      },
    });

    return { ok: true };
  }

  async updateItem(numeroPed: string, seq: number, dto: PedidosUpdateItemDto) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const item = await this.prisma.client.orderItem.findFirst({
      where: { orderId: order.id, lineNumber: seq },
      select: { id: true, quantity: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');

    const pickedQty = dto.quantidade_separada;
    if (pickedQty !== undefined) {
      if (pickedQty > item.quantity) {
        throw new BadRequestException('quantidade_separada não pode exceder quantidade_pedida.');
      }
      if (order.status !== OrderStatus.EM_SEPARACAO) {
        throw new BadRequestException('Só é permitido alterar separação em pedidos EM_SEPARACAO.');
      }
    }

    const nextPicked =
      pickedQty !== undefined ? Math.min(pickedQty, item.quantity) : undefined;

    return this.prisma.client.orderItem.update({
      where: { id: item.id },
      data: {
        pickedQty: nextPicked,
        ...(nextPicked !== undefined
          ? { missingQty: Math.max(0, item.quantity - nextPicked) }
          : {}),
        stockStatus: dto.status_item ? mapStatusItemToStockStatus(dto.status_item) : undefined,
      },
    });
  }

  async concluirSeparacao(numeroPed: string, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return this.orders.markPicked(order.id, userId);
  }

  async filaSeparacao() {
    return this.prisma.client.order.findMany({
      where: {
        AND: [
          PedidosService.separationMinDateWhere(),
          { status: { notIn: [OrderStatus.CANCELADO, OrderStatus.FINALIZADO] } },
        ],
      },
      orderBy: [
        { requestedDeliveryDate: 'asc' },
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
      include: { items: { orderBy: { lineNumber: 'asc' } } },
      take: 200,
    });
  }

  private async resetAllOrdersForImport(): Promise<number> {
    const orders = await this.prisma.client.order.findMany({
      select: {
        id: true,
        code: true,
        externalOrderNumber: true,
        invoiceNumber: true,
      },
    });

    await this.prisma.client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(${EXPEDITION_STOCK_LOCK})`,
        );
        for (const order of orders) {
          await this.stock.purgeOrderRelatedData(tx, order);
          await tx.order.delete({ where: { id: order.id } });
        }
      },
      { timeout: 300_000 },
    );

    return orders.length;
  }

  async importarPlanilha(
    buffer: Uint8Array,
    options?: { reset?: boolean },
  ): Promise<PedidosImportSummary> {
    const summary: PedidosImportSummary = {
      importados: 0,
      atualizados: 0,
      ignorados: 0,
      erros: [],
    };

    if (options?.reset) {
      summary.resetados = await this.resetAllOrdersForImport();
    }

    const parsed = readPedidosSheet(buffer);
    const grouped = groupByNumeroPed(parsed.rows);
    summary.ignorados = parsed.ignored;

    for (const [numero, items] of grouped.entries()) {
      const numeroStr = String(numero);
      try {
        const txResult = await this.prisma.client.$transaction(async (tx) => {
          const header = pickFirstLineOfOrderGroup(items);

          const totalStr = parseBrlMoneyToDecimalString(header.valor_total);
          const totalDec = decimalFromStringOrZero(totalStr);

          const existing = await tx.order.findFirst({
            where: { externalOrderNumber: numeroStr, source: OrderSource.WEG_MERCADO_ELETRONICO },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          });

          const orderData: Prisma.OrderUncheckedCreateInput = {
            id: existing?.id,
            source: OrderSource.WEG_MERCADO_ELETRONICO,
            code: existing ? undefined! : 'TEMP', // será substituído abaixo
            externalOrderNumber: numeroStr,
            customerName: header.recebedor?.trim() || header.ponto_descarga?.trim() || '—',
            receiverName: header.recebedor?.trim() || null,
            unloadingPoint: header.ponto_descarga?.trim() || null,
            deliveryCnpj: header.cnpj_entrega?.trim() || null,
            notes: header.observacao_me?.trim() || null,
            obsExpedicao: header.observacao_logistica?.trim() || null,
            mercadoEletronicoStatus: header.status_me?.trim() || null,
            contaAzulStatus: header.status_ca?.trim() || null,
            invoiceNumber: normalizePlanilhaInvoiceNumber(header.nota_fiscal),
            invoiceStatus: normalizePlanilhaInvoiceNumber(header.nota_fiscal)
              ? InvoiceStatus.PENDING
              : InvoiceStatus.NOT_FOUND,
            orderDate: isoDateStringToUtcDate(header.data_pedido),
            requestedDeliveryDate: isoDateStringToUtcDate(header.data_entrega),
            status: resolveOrderStatusFromPlanilha(header.status_me, header.status_ca),
            priority: 3,
            subtotal: totalDec,
            discount: new Prisma.Decimal('0.00'),
            total: totalDec,
            totalValue: totalDec,
          };

          // Resolve unitPrice via Product.sku quando existir.
          const skus = items.map((r) => r.sku);
          const products = await tx.product.findMany({
            where: { sku: { in: skus } },
            select: { sku: true, price: true },
          });
          const bySku = new Map(products.map((p) => [p.sku, p.price]));

          const carrierId = await this.carrierResolver.resolveCarrierId(
            orderData.deliveryCnpj,
            tx,
          );
          (orderData as Prisma.OrderUncheckedCreateInput).carrierId = carrierId;

          if (!existing) {
            const urgentMatch = await this.findMatchingUrgentManualOrder(
              tx,
              orderData.deliveryCnpj ?? null,
              items
                .map((r) => ({
                  sku: r.sku.trim(),
                  quantity: r.quantidade,
                }))
                .filter((row) => row.sku),
            );

            if (urgentMatch) {
              orderData.linkedOrderId = urgentMatch.id;
              orderData.status = OrderStatus.AGUARDANDO_NF;
              orderData.notaRemessa = urgentMatch.notaRemessa;
              orderData.carrierId = urgentMatch.carrierId;
            }

            // Gera code (mesma regra do ERP)
            const code = await this.nextOrderCode(tx);
            (orderData as Prisma.OrderUncheckedCreateInput).code = code;

            const created = await tx.order.create({
              data: orderData,
              select: { id: true },
            });
            summary.importados += 1;

            for (const r of items) {
              const sku = r.sku.trim();
              const nome = r.nome_produto.trim() || sku;
              const unitPrice = bySku.get(sku) ?? new Prisma.Decimal('0.00');
              const totalPrice = unitPrice.mul(r.quantidade).toDecimalPlaces(2);
              const meItemStatus = normalizePlanilhaItemStatus(r.status_item);
              const productId = await this.findProductIdBySku(tx, sku);
              await tx.orderItem.upsert({
                where: {
                  orderId_lineNumber: { orderId: created.id, lineNumber: r.seq },
                },
                create: {
                  orderId: created.id,
                  lineNumber: r.seq,
                  sku,
                  description: nome,
                  quantity: r.quantidade,
                  unitPrice: unitPrice.toDecimalPlaces(2),
                  totalPrice,
                  discount: new Prisma.Decimal('0.00'),
                  reservedQuantity: 0,
                  missingQty: 0,
                  pickedQty: 0,
                  invoicedQty: 0,
                  productId,
                  mercadoEletronicoItemStatus: meItemStatus,
                  stockStatus: OrderItemStockStatus.NAO_ANALISADO,
                },
                update: {
                  sku,
                  description: nome,
                  quantity: r.quantidade,
                  unitPrice: unitPrice.toDecimalPlaces(2),
                  totalPrice,
                  mercadoEletronicoItemStatus: meItemStatus,
                  ...(productId ? { productId } : {}),
                },
              });
            }

            return {
              linkedUrgentOrderId: urgentMatch?.id ?? null,
              createdOrderId: created.id,
            };
          }

          // Update
          await tx.order.update({
            where: { id: existing.id },
            data: {
              receiverName: orderData.receiverName,
              unloadingPoint: orderData.unloadingPoint,
              deliveryCnpj: orderData.deliveryCnpj,
              notes: orderData.notes,
              obsExpedicao: orderData.obsExpedicao,
              mercadoEletronicoStatus: orderData.mercadoEletronicoStatus,
              contaAzulStatus: orderData.contaAzulStatus,
              invoiceNumber: orderData.invoiceNumber,
              invoiceStatus: orderData.invoiceStatus,
              orderDate: orderData.orderDate,
              requestedDeliveryDate: orderData.requestedDeliveryDate,
              status: orderData.status,
              subtotal: orderData.subtotal,
              total: orderData.total,
              totalValue: orderData.totalValue,
              carrierId,
            },
          });
          summary.atualizados += 1;

          for (const r of items) {
            const sku = r.sku.trim();
            const nome = r.nome_produto.trim() || sku;
            const unitPrice = bySku.get(sku) ?? new Prisma.Decimal('0.00');
            const totalPrice = unitPrice.mul(r.quantidade).toDecimalPlaces(2);
            const meItemStatus = normalizePlanilhaItemStatus(r.status_item);
            const productId = await this.findProductIdBySku(tx, sku);
            await tx.orderItem.upsert({
              where: { orderId_lineNumber: { orderId: existing.id, lineNumber: r.seq } },
              create: {
                orderId: existing.id,
                lineNumber: r.seq,
                sku,
                description: nome,
                quantity: r.quantidade,
                unitPrice: unitPrice.toDecimalPlaces(2),
                totalPrice,
                discount: new Prisma.Decimal('0.00'),
                reservedQuantity: 0,
                missingQty: 0,
                pickedQty: 0,
                invoicedQty: 0,
                productId,
                mercadoEletronicoItemStatus: meItemStatus,
                stockStatus: OrderItemStockStatus.NAO_ANALISADO,
              },
              update: {
                sku,
                description: nome,
                quantity: r.quantidade,
                unitPrice: unitPrice.toDecimalPlaces(2),
                totalPrice,
                mercadoEletronicoItemStatus: meItemStatus,
                ...(productId ? { productId } : {}),
              },
            });
          }

          return { linkedUrgentOrderId: null, createdOrderId: null };
        });

        if (txResult.linkedUrgentOrderId && txResult.createdOrderId) {
          await this.notifyUrgentOrderLinked(
            numeroStr,
            txResult.createdOrderId,
            txResult.linkedUrgentOrderId,
          );
        }
      } catch (e) {
        summary.erros.push(
          `Pedido ${numero}: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
        );
      }
    }

    if (summary.erros.length > 0) {
      const preview = summary.erros.slice(0, 3).join('; ');
      const suffix =
        summary.erros.length > 3
          ? ` (+${summary.erros.length - 3} outros)`
          : '';
      void this.notifications.createForAdmins(
        'Erros no import',
        `${summary.erros.length} erro(s) na importação de pedidos: ${preview}${suffix}`,
        'import_erro',
      );
    }

    return summary;
  }

  private normalizeCnpjDigits(value: string | null | undefined): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length > 0 ? digits : null;
  }

  private normalizeSkuKey(sku: string | null | undefined): string {
    return (sku ?? '').trim().toUpperCase();
  }

  private aggregateSkuQuantities(
    items: Array<{ sku: string; quantity: number }>,
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const item of items) {
      const sku = this.normalizeSkuKey(item.sku);
      if (!sku) continue;
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(sku, (map.get(sku) ?? 0) + qty);
    }
    return map;
  }

  /**
   * Match exato: mesmos SKUs (conjunto idêntico) e mesma quantidade em cada SKU.
   * Qualquer SKU a mais/a menos ou qty diferente → false.
   */
  private skuQuantityMapsMatch(
    manual: Map<string, number>,
    imported: Map<string, number>,
  ): boolean {
    if (manual.size === 0 || imported.size === 0) return false;
    if (manual.size !== imported.size) return false;
    for (const [sku, qty] of manual) {
      if (imported.get(sku) !== qty) return false;
    }
    for (const [sku, qty] of imported) {
      if (manual.get(sku) !== qty) return false;
    }
    return true;
  }

  private async findMatchingUrgentManualOrder(
    tx: Prisma.TransactionClient,
    importedCnpj: string | null,
    importedItems: Array<{ sku: string; quantity: number }>,
  ): Promise<{
    id: string;
    notaRemessa: string | null;
    carrierId: string | null;
  } | null> {
    const importedCnpjDigits = this.normalizeCnpjDigits(importedCnpj);
    const importedSkuQty = this.aggregateSkuQuantities(importedItems);
    if (!importedCnpjDigits || importedSkuQty.size === 0) return null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await tx.order.findMany({
      where: {
        isUrgentManual: true,
        linkedOrderId: null,
        source: OrderSource.MANUAL,
        createdAt: { gte: thirtyDaysAgo },
        customerDocument: { not: null },
      },
      select: {
        id: true,
        customerDocument: true,
        notaRemessa: true,
        carrierId: true,
        items: { select: { sku: true, quantity: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const candidate of candidates) {
      if (
        this.normalizeCnpjDigits(candidate.customerDocument) !==
        importedCnpjDigits
      ) {
        continue;
      }

      const manualSkuQty = this.aggregateSkuQuantities(candidate.items);
      // Exige CNPJ + conjunto EXATO de SKUs + quantidade EXATA por SKU.
      if (!this.skuQuantityMapsMatch(manualSkuQty, importedSkuQty)) {
        continue;
      }

      return {
        id: candidate.id,
        notaRemessa: candidate.notaRemessa,
        carrierId: candidate.carrierId,
      };
    }

    return null;
  }

  private async notifyUrgentOrderLinked(
    meOrderNumber: string,
    meOrderId: string,
    urgentOrderId: string,
  ): Promise<void> {
    const message = `Pedido ${meOrderNumber} foi vinculado ao envio urgente já realizado.`;
    const link = `order:${meOrderId}`;

    const creatorLog = await this.prisma.client.auditLog.findFirst({
      where: {
        entity: 'Order',
        entityId: urgentOrderId,
        action: 'ORDER_CREATED',
        userId: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    });

    if (creatorLog?.userId) {
      void this.notifications.create(
        creatorLog.userId,
        'Pedido vinculado ao urgente',
        message,
        'pedido_vinculado_urgente',
        link,
      );
      return;
    }

    void this.notifications.createForPermission(
      'expedicao',
      'ver_pedidos',
      'Pedido vinculado ao urgente',
      message,
      'pedido_vinculado_urgente',
      link,
    );
  }

  private async findProductIdBySku(
    tx: Prisma.TransactionClient,
    sku: string,
  ): Promise<string | null> {
    const normalized = sku.trim();
    if (!normalized) return null;

    const found = await tx.product.findFirst({
      where: {
        OR: [
          { sku: { equals: normalized, mode: Prisma.QueryMode.insensitive } },
          {
            internalCode: {
              equals: normalized,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
        isActive: true,
      },
      select: { id: true },
    });
    return found?.id ?? null;
  }

  private serializeOrderExit(row: Prisma.OrderExitGetPayload<{
    include: {
      order: {
        include: {
          carrier: { select: { id: true; name: true } };
          items: true;
        };
      };
    };
  }>) {
    const requested = row.order.requestedDeliveryDate;
    const diffDays = requested
      ? Math.ceil((row.exitDate.getTime() - requested.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const orderCarrierName = row.order.carrier?.name ?? null;
    const rowWithRomaneio = row as typeof row & { romaneioAt?: Date | null };
    return {
      id: row.id,
      orderId: row.orderId,
      invoiceNumber: row.invoiceNumber,
      invoiceValue: row.invoiceValue.toString(),
      exitDate: row.exitDate.toISOString(),
      romaneioAt: rowWithRomaneio.romaneioAt?.toISOString() ?? null,
      carrierName: row.carrierName ?? orderCarrierName,
      trackingCode: row.trackingCode,
      punctuality: diffDays > 0 ? 'LATE' : 'ON_TIME',
      delayedDays: diffDays > 0 ? diffDays : 0,
      requestedDeliveryDate: row.order.requestedDeliveryDate?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      order: {
        id: row.order.id,
        code: row.order.code,
        externalOrderNumber: row.order.externalOrderNumber,
        customerName: row.order.customerName,
        customerDocument: row.order.customerDocument,
        receiverName: row.order.receiverName,
        unloadingPoint: row.order.unloadingPoint,
        deliveryAddress: row.order.deliveryAddress,
        deliveryCity: row.order.deliveryCity,
        deliveryState: row.order.deliveryState,
        status: row.order.status,
        totalValue: row.order.totalValue.toString(),
        notes: row.order.notes,
        obsExpedicao: row.order.obsExpedicao,
        notaRemessa: row.order.notaRemessa,
        volumes: (row.order as { volumes?: number | null }).volumes ?? null,
        requestedDeliveryDate: row.order.requestedDeliveryDate?.toISOString() ?? null,
        carrierId: row.order.carrierId,
        carrierName: orderCarrierName,
        items: row.order.items.map((it) => ({
          id: it.id,
          lineNumber: it.lineNumber,
          sku: it.sku,
          description: it.description,
          quantity: it.quantity,
          pickedQty: it.pickedQty,
        })),
      },
    };
  }

  async excluirDadosTitular(documento: string, userId: string) {
    const doc = documento.trim();
    const orders = await this.prisma.client.order.findMany({
      where: {
        OR: [
          { deliveryCnpj: { contains: doc, mode: 'insensitive' } },
          { customerDocument: { contains: doc, mode: 'insensitive' } },
          { receiverName: { contains: doc, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        externalOrderNumber: true,
      },
    });

    for (const order of orders) {
      await this.prisma.client.order.update({
        where: { id: order.id },
        data: {
          receiverName: 'REMOVIDO',
          deliveryCnpj: '00.000.000/0000-00',
          customerName: 'TITULAR REMOVIDO',
          deliveryAddress: null,
          deliveryCity: null,
          deliveryState: null,
        },
      });
    }

    await this.audit.log({
      userId,
      action: 'LGPD_DATA_REMOVAL',
      entity: 'Order',
      entityId: doc,
      changes: {
        documento: doc,
        pedidosAfetados: orders.length,
        orderIds: orders.map((o) => o.id),
        externalOrderNumbers: orders.map((o) => o.externalOrderNumber),
      },
    });

    return { ok: true, pedidosAfetados: orders.length, documento: doc };
  }
}

