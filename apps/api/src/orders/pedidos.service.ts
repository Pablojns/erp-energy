import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, OrderItemStockStatus, OrderSource, OrderStatus, Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { OrderService } from './order.service';
import type { PedidosUpdateItemDto, StatusItemValue } from './dto/pedidos-update-item.dto';
import type { PedidosUpdateStatusDto } from './dto/pedidos-update-status.dto';
import type { CreateManualPedidoDto } from './dto/create-manual-pedido.dto';
import type { PedidosAttachNfDto } from './dto/pedidos-attach-nf.dto';
import {
  decimalFromStringOrZero,
  groupByNumeroPed,
  parseBrlMoneyToDecimalString,
  readPedidosSheet,
  splitSkuAndName,
  type PedidosImportSummary,
} from './pedidos-import';

function mapStatusItemToStockStatus(v: StatusItemValue): OrderItemStockStatus {
  if (v === 'completo') return OrderItemStockStatus.COMPLETO;
  if (v === 'parcial') return OrderItemStockStatus.PARCIAL;
  if (v === 'cancelado') return OrderItemStockStatus.SKU_NAO_ENCONTRADO;
  return OrderItemStockStatus.NAO_ANALISADO;
}

const NEXT_CODE_ADVISORY_LOCK = 94821002;

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderService,
  ) {}

  list(query: Parameters<OrderService['findMany']>[0]) {
    return this.orders.findMany(query as never);
  }

  createManual(userId: string, dto: CreateManualPedidoDto) {
    return this.orders.createManualPedido(userId, dto);
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

  async findByNumeroPed(numeroPed: number) {
    const res = await this.orders.findMany({
      externalOrderNumber: String(numeroPed),
      page: 1,
      pageSize: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    } as never);
    const first = res?.data?.[0];
    if (!first) throw new NotFoundException('Pedido não encontrado.');
    return first;
  }

  async listItems(numeroPed: number) {
    const order = await this.prisma.client.order.findFirst({
      where: {
        externalOrderNumber: String(numeroPed),
        source: OrderSource.WEG_MERCADO_ELETRONICO,
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

  async updateStatuses(numeroPed: number, dto: PedidosUpdateStatusDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
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
    return this.prisma.client.order.update({
      where: { id: order.id },
      data,
    });
  }

  async attachNf(numeroPed: number, dto: PedidosAttachNfDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
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

  async gerarSaidaComNf(numeroPed: number, dto: PedidosAttachNfDto, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
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

  async salvarSeparacao(numeroPed: number) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
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
      pedido: String(numeroPed),
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
          include: { items: { orderBy: { lineNumber: 'asc' } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Saída não encontrada.');
    return this.serializeOrderExit(row);
  }

  async updateItem(numeroPed: number, seq: number, dto: PedidosUpdateItemDto) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
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

  async concluirSeparacao(numeroPed: number, userId: string) {
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: String(numeroPed) },
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

  async importarPlanilha(buffer: Uint8Array): Promise<PedidosImportSummary> {
    const parsed = readPedidosSheet(buffer);
    const grouped = groupByNumeroPed(parsed.rows);
    const summary: PedidosImportSummary = {
      importados: 0,
      atualizados: 0,
      ignorados: parsed.ignored,
      erros: [],
    };

    for (const [numero, items] of grouped.entries()) {
      try {
        await this.prisma.client.$transaction(async (tx) => {
          const numeroStr = String(numero);
          const first = items[0]!;

          const totalStr = parseBrlMoneyToDecimalString(first.valor_total);
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
            customerName: first.recebedor?.trim() || first.ponto_descarga?.trim() || '—',
            receiverName: first.recebedor?.trim() || null,
            unloadingPoint: first.ponto_descarga?.trim() || null,
            deliveryCnpj: first.cnpj_entrega?.trim() || null,
            notes: first.observacao?.trim() || null,
            mercadoEletronicoStatus: first.status_me?.trim() || null,
            contaAzulStatus: first.status_ca?.trim() || null,
            invoiceNumber: first.nota_fiscal?.trim() || null,
            invoiceStatus: first.nota_fiscal ? InvoiceStatus.PENDING : InvoiceStatus.NOT_FOUND,
            orderDate: new Date(first.data_pedido),
            requestedDeliveryDate: new Date(first.data_entrega),
            status: OrderStatus.NOVO,
            priority: 3,
            subtotal: totalDec,
            discount: new Prisma.Decimal('0.00'),
            total: totalDec,
            totalValue: totalDec,
          };

          // Resolve unitPrice via Product.sku quando existir.
          const skus = items.map((r) => splitSkuAndName(r.produto).sku);
          const products = await tx.product.findMany({
            where: { sku: { in: skus } },
            select: { sku: true, price: true },
          });
          const bySku = new Map(products.map((p) => [p.sku, p.price]));

          if (!existing) {
            // Gera code (mesma regra do ERP)
            const code = await this.nextOrderCode(tx);
            (orderData as Prisma.OrderUncheckedCreateInput).code = code;

            const created = await tx.order.create({
              data: orderData,
              select: { id: true },
            });
            summary.importados += 1;

            for (const r of items) {
              const { sku, nome } = splitSkuAndName(r.produto);
              const unitPrice = bySku.get(sku) ?? new Prisma.Decimal('0.00');
              const totalPrice = unitPrice.mul(r.quantidade).toDecimalPlaces(2);
              await tx.orderItem.create({
                data: {
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
                  stockStatus: OrderItemStockStatus.NAO_ANALISADO,
                },
              });
            }
            return;
          }

          // Update
          await tx.order.update({
            where: { id: existing.id },
            data: {
              receiverName: orderData.receiverName,
              unloadingPoint: orderData.unloadingPoint,
              deliveryCnpj: orderData.deliveryCnpj,
              notes: orderData.notes,
              mercadoEletronicoStatus: orderData.mercadoEletronicoStatus,
              contaAzulStatus: orderData.contaAzulStatus,
              invoiceNumber: orderData.invoiceNumber,
              invoiceStatus: orderData.invoiceStatus,
              orderDate: orderData.orderDate,
              requestedDeliveryDate: orderData.requestedDeliveryDate,
              subtotal: orderData.subtotal,
              total: orderData.total,
              totalValue: orderData.totalValue,
            },
          });
          summary.atualizados += 1;

          for (const r of items) {
            const { sku, nome } = splitSkuAndName(r.produto);
            const unitPrice = bySku.get(sku) ?? new Prisma.Decimal('0.00');
            const totalPrice = unitPrice.mul(r.quantidade).toDecimalPlaces(2);
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
                stockStatus: OrderItemStockStatus.NAO_ANALISADO,
              },
              update: {
                sku,
                description: nome,
                quantity: r.quantidade,
                unitPrice: unitPrice.toDecimalPlaces(2),
                totalPrice,
              },
            });
          }
        });
      } catch (e) {
        summary.erros.push(
          `Pedido ${numero}: ${e instanceof Error ? e.message : 'erro desconhecido'}`,
        );
      }
    }

    return summary;
  }

  private serializeOrderExit(row: Prisma.OrderExitGetPayload<{
    include: {
      order: { include: { items: true } };
    };
  }>) {
    const requested = row.order.requestedDeliveryDate;
    const diffDays = requested
      ? Math.ceil((row.exitDate.getTime() - requested.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    return {
      id: row.id,
      orderId: row.orderId,
      invoiceNumber: row.invoiceNumber,
      invoiceValue: row.invoiceValue.toString(),
      exitDate: row.exitDate.toISOString(),
      carrierName: row.carrierName,
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
        requestedDeliveryDate: row.order.requestedDeliveryDate?.toISOString() ?? null,
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
}

