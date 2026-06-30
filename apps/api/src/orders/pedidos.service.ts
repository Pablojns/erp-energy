import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  InvoiceStatus,
  OrderItemStockStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  StockMovementType,
} from '@erp/database';
import { AuditService } from '../common/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../stock/stock.service';
import { CarrierResolverService } from './carrier-resolver.service';
import { OrderService } from './order.service';
import type { PedidosUpdateItemDto, StatusItemValue } from './dto/pedidos-update-item.dto';
import type { PedidosUpdateStatusDto } from './dto/pedidos-update-status.dto';
import type { CreateManualPedidoDto } from './dto/create-manual-pedido.dto';
import type { CreateSitePedidoDto } from './dto/create-site-pedido.dto';
import type { PedidosAttachNfDto } from './dto/pedidos-attach-nf.dto';
import type { UpdateOrderPriorityDto } from './dto/update-order-priority.dto';
import type { UpdatePedidoAdminDto } from './dto/update-pedido-admin.dto';
import {
  decimalFromStringOrZero,
  groupByNumeroPed,
  isoDateStringToUtcDate,
  normalizePlanilhaItemStatus,
  parseBrlMoneyToDecimalString,
  pickFirstLineOfOrderGroup,
  readPedidosSheet,
  resolveOrderStatusFromPlanilha,
  type PedidosImportSummary,
} from './pedidos-import';

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

        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.RESERVA,
            quantity: qty,
            reference: order.code,
            notes: `Reserva pedido site ${order.code}`,
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
      const nextStatus = allCompleto
        ? OrderStatus.RESERVADO
        : OrderStatus.PARCIAL;

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: nextStatus,
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
          status: nextStatus,
          source: 'site',
          reservedFullQuantity: true,
        },
      });
    });

    return this.orders.findOne(orderId);
  }

  list(query: Parameters<OrderService['findMany']>[0]) {
    return this.orders.findMany(query as never);
  }

  updateManual(userId: string, numeroPed: string, dto: CreateManualPedidoDto) {
    return this.orders.updateManualPedido(
      userId,
      numeroPed as unknown as number,
      dto,
    );
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

  private readInvoiceNumber(dto: PedidosAttachNfDto): string {
    return (dto.invoiceNumber ?? dto.nota_fiscal ?? '').trim();
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

  async attachNf(numeroPed: string, dto: PedidosAttachNfDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
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
    return this.orders.generateExitFromInvoice(order.id, userId, { invoiceNumber: nf });
  }

  async gerarSaidaComNf(numeroPed: string, dto: PedidosAttachNfDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroPed.trim() },
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
          invoiceNumber: {
            contains: search,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          carrierName: {
            contains: search,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          order: {
            externalOrderNumber: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
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

    return this.prisma.client.orderItem.update({
      where: { id: item.id },
      data: {
        pickedQty: pickedQty ?? undefined,
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
        status: { notIn: [OrderStatus.CANCELADO, OrderStatus.FINALIZADO] },
        OR: [
          { mercadoEletronicoStatus: null },
          { mercadoEletronicoStatus: '' },
          {
            mercadoEletronicoStatus: {
              contains: 'sem recebimento',
              mode: 'insensitive',
            },
          },
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
            invoiceNumber: header.nota_fiscal?.trim() || null,
            invoiceStatus: header.nota_fiscal ? InvoiceStatus.PENDING : InvoiceStatus.NOT_FOUND,
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
              items.map((r) => r.sku.trim()).filter(Boolean),
            );

            if (urgentMatch) {
              orderData.linkedOrderId = urgentMatch.id;
              orderData.status = OrderStatus.AGUARDANDO_NF;
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

  private async findMatchingUrgentManualOrder(
    tx: Prisma.TransactionClient,
    deliveryCnpj: string | null,
    skus: string[],
  ): Promise<{ id: string } | null> {
    const cnpjDigits = this.normalizeCnpjDigits(deliveryCnpj);
    const skuSet = new Set(skus.map((s) => s.trim()).filter(Boolean));
    if (!cnpjDigits || skuSet.size === 0) return null;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const candidates = await tx.order.findMany({
      where: {
        isUrgentManual: true,
        linkedOrderId: null,
        source: OrderSource.MANUAL,
        createdAt: { gte: thirtyDaysAgo },
        deliveryCnpj: { not: null },
      },
      include: {
        items: { select: { sku: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const candidate of candidates) {
      if (this.normalizeCnpjDigits(candidate.deliveryCnpj) !== cnpjDigits) {
        continue;
      }
      const hasCommonSku = candidate.items.some((item) =>
        skuSet.has(item.sku.trim()),
      );
      if (hasCommonSku) {
        return { id: candidate.id };
      }
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
    return {
      id: row.id,
      orderId: row.orderId,
      invoiceNumber: row.invoiceNumber,
      invoiceValue: row.invoiceValue.toString(),
      exitDate: row.exitDate.toISOString(),
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

