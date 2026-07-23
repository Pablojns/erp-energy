import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  OrderItemStockStatus,
  OrderSource,
  OrderStatus,
  Prisma,
  StockMovementType,
} from '@erp/database';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateManualPedidoDto } from './dto/create-manual-pedido.dto';
import type { CreateSitePedidoDto } from './dto/create-site-pedido.dto';
import type { CreateVendaExternaPedidoDto } from './dto/create-venda-externa-pedido.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import type { CreateWegOrderDto } from './dto/create-wego-order.dto';
import type { OrderQueryDto } from './dto/order-query.dto';
import type { AttachInvoiceDto } from './dto/attach-invoice.dto';
import type { UpdateOrderItemPickedDto } from './dto/update-order-item-picked.dto';
import type { UpdateOrderPriorityDto } from './dto/update-order-priority.dto';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  ORDER_STATUS_EXPEDITION_CHAIN,
  ORDER_STATUS_VALUES,
  WEG_TAB_ORDER_SOURCES,
  orderStockReference,
} from './order-domain';
import { CarrierResolverService } from './carrier-resolver.service';
import { AppLogger } from '../common/logger/app-logger';
import {
  findActiveReservationByOrderItem,
  markOrderItemReservationReleased,
  markStockReservationReleased,
  orderNumberFromOrder,
  upsertStockReservation,
} from '../stock/stock-reservation.helpers';

type Tx = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const RESERVE_ADVISORY_LOCK = 94821001;
const NEXT_CODE_ADVISORY_LOCK = 94821002;

const TERMINAL: OrderStatus[] = [
  OrderStatus.FINALIZADO,
  OrderStatus.CANCELADO,
];

/** Pedidos encerrados não entram no contador de atrasados. */
const DELAYED_EXCLUDED_STATUSES: OrderStatus[] = [
  OrderStatus.FINALIZADO,
  OrderStatus.CANCELADO,
  OrderStatus.EXPEDIDO,
];

const EMPTY_EXPEDITION_SUMMARY = {
  totalPedidos: 0,
  pedidosWeg: 0,
  urgentes: 0,
  atrasados: 0,
  reservados: 0,
  emSeparacao: 0,
  aguardandoNf: 0,
  faturados: 0,
  cobrarRecebimento: 0,
  valorTotal: '0',
  estoqueReservadoTotal: '0',
  rupturaPedidos: 0,
} as const;

type OrderItemSerializeSource = {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  reservedQuantity: number;
  missingQty?: number;
  pickedQty?: number;
  invoicedQty?: number;
  mercadoEletronicoItemStatus?: string | null;
  availableAtAnalysis?: number | null;
  stockStatus?: OrderItemStockStatus;
  unit: string | null;
  ncm: string | null;
  unitPrice: Prisma.Decimal;
  totalPrice: Prisma.Decimal;
  productId: string | null;
  /** Omitido quando o include não carrega relação — serialize trata como null. */
  product?:
    | {
        id: string;
        name: string;
        sku: string;
        stockQty: number;
        reservedQty: number;
      }
    | null;
};

type OrderSerializeSource = {
  id: string;
  source: OrderSource;
  code: string;
  externalOrderNumber: string | null;
  mercadoEletronicoNumber: string | null;
  customerId: string | null;
  customerName: string;
  customerDocument: string | null;
  customerCity: string | null;
  customerState: string | null;
  receiverName: string | null;
  unloadingPoint: string | null;
  deliveryCnpj: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  notaRemessa: string | null;
  notaRemessaConfirmada?: boolean;
  volumes?: number | null;
  trackingCode?: string | null;
  status: OrderStatus;
  priority: number;
  mercadoEletronicoStatus: string | null;
  contaAzulStatus: string | null;
  invoiceNumber: string | null;
  invoiceStatus: InvoiceStatus;
  orderDate: Date | null;
  requestedDeliveryDate: Date | null;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
  totalValue: Prisma.Decimal;
  reservedAt: Date | null;
  shippedAt: Date | null;
  invoicedAt: Date | null;
  carrierId: string | null;
  carrier?: { id: string; name: string } | null;
  linkedOrderId: string | null;
  isUrgentManual: boolean;
  linkedOrder?: {
    id: string;
    code: string;
    externalOrderNumber: string | null;
  } | null;
  exits?: Array<{ trackingCode: string | null }>;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemSerializeSource[];
  stockReservations?: Array<{ id: string }>;
};

@Injectable()
export class OrderService {
  private readonly logger = new AppLogger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly carrierResolver: CarrierResolverService,
  ) {}

  /** KPIs da expedição — respeita os mesmos filtros da listagem (exceto paginação). */
  async summary(query: OrderQueryDto) {
    try {
      const where = this.buildWhere(query);

      const todayUtc = OrderService.startOfUtcDay(new Date());

      const delayedArm: Prisma.OrderWhereInput = {
        requestedDeliveryDate: { lt: todayUtc },
        status: { notIn: DELAYED_EXCLUDED_STATUSES },
      };

      const urgentArm: Prisma.OrderWhereInput = {
        priority: { lte: 2 },
        status: { notIn: TERMINAL },
      };

      const [
        totalOrders,
        wegOrders,
        urgentOrders,
        delayedOrders,
        reservedOrders,
        pickingOrders,
        waitingInvoiceOrders,
        invoicedOrders,
        chargeReceiptOrders,
        agg,
        reservedStockAgg,
        rupturaPedidos,
      ] = await Promise.all([
        this.prisma.client.order.count({ where }),
        this.prisma.client.order.count({
          where: {
            AND: [
              where,
              { source: OrderSource.WEG_MERCADO_ELETRONICO },
            ],
          },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, urgentArm] },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, delayedArm] },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, { status: OrderStatus.RESERVADO }] },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, { status: OrderStatus.EM_SEPARACAO }] },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, { status: OrderStatus.AGUARDANDO_NF }] },
        }),
        this.prisma.client.order.count({
          where: { AND: [where, { status: OrderStatus.NF_ATRELADA }] },
        }),
        this.prisma.client.order.count({
          where: {
            AND: [
              where,
              { invoiceStatus: InvoiceStatus.CHARGE_RECEIPT },
            ],
          },
        }),
        this.prisma.client.order.aggregate({
          where,
          _sum: { totalValue: true },
        }),
        this.prisma.client.product.aggregate({
          where: { isActive: true },
          _sum: { reservedQty: true },
        }),
        this.countStockRuptureOrders(where),
      ]);

      const sum = agg._sum?.totalValue;
      const reservedSum = reservedStockAgg._sum?.reservedQty ?? 0;

      return {
        totalPedidos: totalOrders,
        pedidosWeg: wegOrders,
        urgentes: urgentOrders,
        atrasados: delayedOrders,
        reservados: reservedOrders,
        emSeparacao: pickingOrders,
        aguardandoNf: waitingInvoiceOrders,
        faturados: invoicedOrders,
        cobrarRecebimento: chargeReceiptOrders,
        valorTotal: sum ? sum.toString() : '0',
        estoqueReservadoTotal: String(reservedSum),
        rupturaPedidos,
      };
    } catch (e: unknown) {
      this.logger.error(
        'Order summary query failed; returning empty summary fallback',
        e,
        {
          fallbackUsed: true,
          recommendation: 'Run database migrations and validate schema sync',
        },
      );
      return { ...EMPTY_EXPEDITION_SUMMARY };
    }
  }

  /** Pedidos com unidades faltantes (missingQty > 0), respeitando filtros. */
  private async countStockRuptureOrders(
    baseWhere: Prisma.OrderWhereInput,
  ): Promise<number> {
    return this.prisma.client.order.count({
      where: {
        AND: [
          baseWhere,
          { status: { notIn: TERMINAL } },
          {
            items: {
              some: { missingQty: { gt: 0 } },
            },
          },
        ],
      },
    });
  }

  async filterCnpjs(search?: string) {
    const term = search?.trim();
    const rows = await this.prisma.client.order.findMany({
      where: {
        deliveryCnpj: {
          not: null,
          ...(term
            ? { contains: term, mode: Prisma.QueryMode.insensitive }
            : {}),
        },
      },
      select: { deliveryCnpj: true },
      distinct: ['deliveryCnpj'],
      orderBy: { deliveryCnpj: 'asc' },
      take: 80,
    });
    return rows
      .map((r) => r.deliveryCnpj)
      .filter((v): v is string => !!v?.trim());
  }

  async filterReceivers(search?: string) {
    const term = search?.trim();
    const rows = await this.prisma.client.order.findMany({
      where: {
        receiverName: {
          not: null,
          ...(term
            ? { contains: term, mode: Prisma.QueryMode.insensitive }
            : {}),
        },
      },
      select: { receiverName: true },
      distinct: ['receiverName'],
      orderBy: { receiverName: 'asc' },
      take: 80,
    });
    return rows
      .map((r) => r.receiverName)
      .filter((v): v is string => !!v?.trim());
  }

  async filterUnloadingPoints(search?: string) {
    const term = search?.trim();
    const rows = await this.prisma.client.order.findMany({
      where: {
        unloadingPoint: {
          not: null,
          ...(term
            ? { contains: term, mode: Prisma.QueryMode.insensitive }
            : {}),
        },
      },
      select: { unloadingPoint: true },
      distinct: ['unloadingPoint'],
      orderBy: { unloadingPoint: 'asc' },
      take: 80,
    });
    return rows
      .map((r) => r.unloadingPoint)
      .filter((v): v is string => !!v?.trim());
  }

  async filterSkus(search?: string) {
    const term = search?.trim();
    const rows = await this.prisma.client.orderItem.findMany({
      where: {
        sku: {
          not: '',
          ...(term
            ? { contains: term, mode: Prisma.QueryMode.insensitive }
            : {}),
        },
      },
      select: { sku: true },
      distinct: ['sku'],
      orderBy: { sku: 'asc' },
      take: 120,
    });
    return rows.map((r) => r.sku).filter(Boolean);
  }

  async findMany(query: OrderQueryDto) {
    const page = query.page !== undefined && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize !== undefined &&
      query.pageSize > 0 &&
      query.pageSize <= 100
        ? query.pageSize
        : 15;

    try {
      const where = this.buildWhere(query);

      const orderBy = this.buildOrderBy(query);

      const total = await this.prisma.client.order.count({ where });
      const rows = await this.prisma.client.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: OrderService.orderInclude(),
      });

      return {
        data: rows.map((o) => this.serializeOrder(o)),
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      };
    } catch (e: unknown) {
      this.logger.error(
        'Order list query failed; returning empty list fallback',
        e,
        {
          fallbackUsed: true,
          page,
          pageSize,
          recommendation: 'Run database migrations and validate schema sync',
        },
      );
      return {
        data: [],
        meta: {
          page,
          pageSize,
          total: 0,
          totalPages: 1,
        },
      };
    }
  }

  async findOne(id: string) {
    const row = await this.prisma.client.order.findUnique({
      where: { id },
      include: OrderService.orderInclude(),
    });
    if (!row) throw new NotFoundException('Pedido não encontrado.');
    return this.serializeOrder(row);
  }

  /** Fluxo legado (produtos cadastrados) — não reserva estoque automaticamente. */
  async create(userId: string, dto: CreateOrderDto) {
    const mergedLines = new Map<
      string,
      { qty: number; unitPriceHint?: number }
    >();
    for (const li of dto.items) {
      const prev = mergedLines.get(li.productId);
      if (prev) {
        mergedLines.set(li.productId, {
          qty: prev.qty + li.quantity,
          unitPriceHint:
            prev.unitPriceHint ??
            li.unitPrice,
        });
      } else {
        mergedLines.set(li.productId, {
          qty: li.quantity,
          unitPriceHint: li.unitPrice,
        });
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const productIds = [...mergedLines.keys()].sort();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const pid of productIds) {
        const p = byId.get(pid);
        if (!p) {
          throw new BadRequestException(`Produto ${pid} não encontrado.`);
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Produto ${p.name} está inativo e não pode constar em pedidos.`,
          );
        }
      }

      const code = await this.nextOrderCode(tx);
      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;

      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const { qty, unitPriceHint } = mergedLines.get(pid)!;
        const unitPrice =
          unitPriceHint !== undefined && unitPriceHint !== null
            ? new Prisma.Decimal(Number(unitPriceHint).toFixed(2))
            : p.price;
        const totalLine = unitPrice.mul(qty).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          product: { connect: { id: pid } },
          lineNumber,
          sku: p.sku,
          description: p.name,
          quantity: qty,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
        });
        lineNumber += 10;
      }

      const priority = dto.priority ?? 3;
      const totalFixed = subtotalDec.toDecimalPlaces(2);
      const customerDocument = dto.customerDocument?.trim() || null;
      const carrierId = await this.carrierResolver.resolveCarrierId(
        customerDocument,
        tx,
      );

      const order = await tx.order.create({
        data: {
          source: OrderSource.MANUAL,
          code,
          customerName: dto.customerName.trim(),
          customerDocument,
          customerCity: dto.customerCity?.trim() || null,
          customerState: dto.customerState?.trim()?.toUpperCase() || null,
          deliveryCity: dto.customerCity?.trim() || null,
          deliveryState: dto.customerState?.trim()?.toUpperCase() || null,
          notes: dto.notes?.trim() || null,
          status: OrderStatus.NOVO,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          priority,
          orderDate: new Date(),
          subtotal: totalFixed,
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          carrierId,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          lines: order.items.length,
          subtotal: totalFixed.toString(),
          status: order.status,
          reservedAutomatically: false,
        },
      });

      return this.serializeOrder(order);
    });
  }

  /** Pedido manual pela expedição — status NOVO, sem reserva automática. */
  async createManualPedido(userId: string, dto: CreateManualPedidoDto) {
    const externalOrderNumber = dto.externalOrderNumber.trim();
    if (!externalOrderNumber) {
      throw new BadRequestException('Número do pedido é obrigatório.');
    }

    const deliveryRaw = dto.requestedDeliveryDate.trim();
    const requestedDeliveryDate = new Date(`${deliveryRaw}T12:00:00.000Z`);
    if (Number.isNaN(requestedDeliveryDate.getTime())) {
      throw new BadRequestException('Data de entrega prevista inválida.');
    }

    const duplicate = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Já existe pedido com este número.');
    }

    const [receiver, unloadingPoint, customer] = await Promise.all([
      this.prisma.client.receiver.findUnique({
        where: { id: dto.receiverId },
      }),
      this.prisma.client.unloadingPoint.findUnique({
        where: { id: dto.unloadingPointId },
      }),
      this.prisma.client.customer.findUnique({
        where: { id: dto.customerId },
      }),
    ]);

    if (!receiver?.isActive) {
      throw new BadRequestException('Recebedor inválido ou inativo.');
    }
    if (!unloadingPoint?.isActive) {
      throw new BadRequestException('Ponto de descarga inválido ou inativo.');
    }
    if (!customer?.isActive) {
      throw new BadRequestException('Cliente inválido ou inativo.');
    }

    const mergedLines = new Map<
      string,
      { qty: number; unitPriceHint?: number }
    >();
    for (const li of dto.items) {
      const prev = mergedLines.get(li.productId);
      if (prev) {
        mergedLines.set(li.productId, {
          qty: prev.qty + li.quantity,
          unitPriceHint: prev.unitPriceHint ?? li.unitPrice,
        });
      } else {
        mergedLines.set(li.productId, {
          qty: li.quantity,
          unitPriceHint: li.unitPrice,
        });
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const productIds = [...mergedLines.keys()].sort();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const pid of productIds) {
        const p = byId.get(pid);
        if (!p) {
          throw new BadRequestException(`Produto ${pid} não encontrado.`);
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Produto ${p.name} está inativo e não pode constar em pedidos.`,
          );
        }
      }

      const code = await this.nextOrderCode(tx);
      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;

      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const { qty, unitPriceHint } = mergedLines.get(pid)!;
        const unitPrice =
          unitPriceHint !== undefined && unitPriceHint !== null
            ? new Prisma.Decimal(Number(unitPriceHint).toFixed(2))
            : p.price;
        const totalLine = unitPrice.mul(qty).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          product: { connect: { id: pid } },
          lineNumber,
          sku: p.sku,
          description: p.name,
          quantity: qty,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
          stockStatus: OrderItemStockStatus.NAO_ANALISADO,
        });
        lineNumber += 10;
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);
      const customerDocument = customer.document?.trim() || null;
      const carrierId = await this.carrierResolver.resolveCarrierId(
        customerDocument,
        tx,
      );

      const order = await tx.order.create({
        data: {
          source: OrderSource.MANUAL,
          code,
          externalOrderNumber,
          customerId: customer.id,
          customerName: customer.name.trim(),
          customerDocument,
          deliveryCnpj: customerDocument,
          deliveryAddress: customer.deliveryAddress?.trim() || null,
          receiverName: receiver.name.trim(),
          unloadingPoint: unloadingPoint.name.trim(),
          notes: dto.notes?.trim() || null,
          isUrgentManual: Boolean(dto.isUrgentManual),
          status: OrderStatus.NOVO,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          priority: 3,
          orderDate: new Date(),
          requestedDeliveryDate,
          subtotal: totalFixed,
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          carrierId,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          externalOrderNumber,
          lines: order.items.length,
          subtotal: totalFixed.toString(),
          status: order.status,
          source: 'manual_expedicao',
          isUrgentManual: Boolean(dto.isUrgentManual),
          reservedAutomatically: false,
        },
      });

      return this.serializeOrder(order);
    });
  }

  /** Pedido originado no site — status NOVO; reserva feita pelo chamador. */
  async createSitePedido(userId: string, dto: CreateSitePedidoDto) {
    const externalOrderNumber = dto.externalOrderNumber.trim().replace(/^#/, '');
    if (!externalOrderNumber) {
      throw new BadRequestException('Número do pedido no site é obrigatório.');
    }

    const deliveryRaw = dto.requestedDeliveryDate.trim();
    const requestedDeliveryDate = new Date(`${deliveryRaw}T12:00:00.000Z`);
    if (Number.isNaN(requestedDeliveryDate.getTime())) {
      throw new BadRequestException('Data de entrega prevista inválida.');
    }

    const duplicate = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Já existe pedido com este número.');
    }

    const [customer, carrier] = await Promise.all([
      this.prisma.client.customer.findUnique({
        where: { id: dto.customerId },
      }),
      this.prisma.client.carrier.findUnique({
        where: { id: dto.carrierId },
      }),
    ]);

    if (!customer?.isActive) {
      throw new BadRequestException('Cliente inválido ou inativo.');
    }
    if (!carrier?.isActive) {
      throw new BadRequestException('Transportadora inválida ou inativa.');
    }

    const allowedCarriers = ['JADLOG', 'SEDEX', 'PAC', 'MINI ENVIOS'];
    if (!allowedCarriers.includes(carrier.name.trim().toUpperCase())) {
      throw new BadRequestException('Transportadora não permitida para pedidos do site.');
    }

    const mergedLines = new Map<
      string,
      { qty: number; unitPriceHint?: number }
    >();
    for (const li of dto.items) {
      const prev = mergedLines.get(li.productId);
      if (prev) {
        mergedLines.set(li.productId, {
          qty: prev.qty + li.quantity,
          unitPriceHint: prev.unitPriceHint ?? li.unitPrice,
        });
      } else {
        mergedLines.set(li.productId, {
          qty: li.quantity,
          unitPriceHint: li.unitPrice,
        });
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const productIds = [...mergedLines.keys()].sort();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const pid of productIds) {
        const p = byId.get(pid);
        if (!p) {
          throw new BadRequestException(`Produto ${pid} não encontrado.`);
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Produto ${p.name} está inativo e não pode constar em pedidos.`,
          );
        }
      }

      const code = await this.nextOrderCode(tx);
      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;

      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const { qty, unitPriceHint } = mergedLines.get(pid)!;
        const unitPrice =
          unitPriceHint !== undefined && unitPriceHint !== null
            ? new Prisma.Decimal(Number(unitPriceHint).toFixed(2))
            : p.price;
        const totalLine = unitPrice.mul(qty).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          product: { connect: { id: pid } },
          lineNumber,
          sku: p.sku,
          description: p.name,
          quantity: qty,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
          stockStatus: OrderItemStockStatus.NAO_ANALISADO,
        });
        lineNumber += 10;
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);
      const customerDocument = customer.document?.trim() || null;
      const deliveryCnpj =
        dto.deliveryCnpj?.trim() || customerDocument || null;

      const order = await tx.order.create({
        data: {
          source: OrderSource.SITE,
          code,
          externalOrderNumber,
          customerId: customer.id,
          customerName: customer.name.trim(),
          customerDocument,
          deliveryCnpj,
          deliveryAddress: customer.deliveryAddress?.trim() || null,
          receiverName: customer.name.trim(),
          unloadingPoint: customer.deliveryAddress?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: OrderStatus.NOVO,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          priority: 3,
          orderDate: new Date(),
          requestedDeliveryDate,
          subtotal: totalFixed,
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          carrierId: carrier.id,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          externalOrderNumber,
          lines: order.items.length,
          subtotal: totalFixed.toString(),
          status: order.status,
          source: 'site',
          reservedAutomatically: true,
        },
      });

      return this.serializeOrder(order);
    });
  }

  /** Pedido de venda externa — linhas livres, sem reserva de estoque. */
  async createVendaExterna(userId: string, dto: CreateVendaExternaPedidoDto) {
    const externalOrderNumber = dto.externalOrderNumber.trim();
    if (!externalOrderNumber) {
      throw new BadRequestException('Número do pedido é obrigatório.');
    }

    const deliveryRaw = dto.requestedDeliveryDate.trim();
    const requestedDeliveryDate = new Date(`${deliveryRaw}T12:00:00.000Z`);
    if (Number.isNaN(requestedDeliveryDate.getTime())) {
      throw new BadRequestException('Data de entrega prevista inválida.');
    }

    const duplicate = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Já existe pedido com este número.');
    }

    const customer = await this.prisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer?.isActive) {
      throw new BadRequestException('Cliente inválido ou inativo.');
    }

    let carrierId: string | null = null;
    if (dto.carrierId?.trim()) {
      const carrier = await this.prisma.client.carrier.findUnique({
        where: { id: dto.carrierId.trim() },
      });
      if (!carrier?.isActive) {
        throw new BadRequestException('Transportadora inválida ou inativa.');
      }
      carrierId = carrier.id;
    }

    return this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextOrderCode(tx);
      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;
      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const li of dto.items) {
        const description = li.description.trim();
        if (!description) {
          throw new BadRequestException('Informe a descrição de todos os itens.');
        }
        const unitPrice = new Prisma.Decimal(Number(li.unitPrice).toFixed(2));
        const totalLine = unitPrice.mul(li.quantity).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          lineNumber,
          sku: '',
          description,
          quantity: li.quantity,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
          stockStatus: OrderItemStockStatus.NAO_ANALISADO,
        });
        lineNumber += 10;
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);
      const customerDocument = customer.document?.trim() || null;
      const deliveryAddress = customer.deliveryAddress?.trim() || null;

      const order = await tx.order.create({
        data: {
          source: 'VENDA_EXTERNA' as OrderSource,
          code,
          externalOrderNumber,
          customerId: customer.id,
          customerName: customer.name.trim(),
          customerDocument,
          deliveryCnpj: customerDocument,
          deliveryAddress,
          receiverName: customer.name.trim(),
          unloadingPoint: deliveryAddress,
          notaRemessa: dto.notaRemessa?.trim() || null,
          notes: dto.notes?.trim() || null,
          status: OrderStatus.NOVO,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          priority: 3,
          orderDate: new Date(),
          requestedDeliveryDate,
          subtotal: totalFixed,
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          carrierId,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_CREATED',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          externalOrderNumber,
          lines: order.items.length,
          subtotal: totalFixed.toString(),
          status: order.status,
          source: 'venda_externa',
          reservedAutomatically: false,
        },
      });

      return this.serializeOrder(order);
    });
  }

  /**
   * Substitui itens de pedido SITE (libera reservas físicas, recalcula totais).
   * A re-reserva fica a cargo do chamador (`reserveSitePedido`).
   */
  async replaceSiteOrderItems(
    userId: string,
    orderId: string,
    items: Array<{ productId: string; quantity: number; unitPrice?: number }>,
  ) {
    if (!items.length) {
      throw new BadRequestException('Informe ao menos um item.');
    }

    const mergedLines = new Map<
      string,
      { qty: number; unitPriceHint?: number }
    >();
    for (const li of items) {
      const prev = mergedLines.get(li.productId);
      if (prev) {
        mergedLines.set(li.productId, {
          qty: prev.qty + li.quantity,
          unitPriceHint: prev.unitPriceHint ?? li.unitPrice,
        });
      } else {
        mergedLines.set(li.productId, {
          qty: li.quantity,
          unitPriceHint: li.unitPrice,
        });
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.source !== OrderSource.SITE) {
        throw new BadRequestException(
          'Somente pedidos do site podem ter itens substituídos por esta rota.',
        );
      }

      await this.releaseReservations(
        tx,
        userId,
        orderStockReference(order),
        order.id,
        order.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          reservedQuantity: it.reservedQuantity,
        })),
      );

      const productIds = [...mergedLines.keys()].sort();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const pid of productIds) {
        const p = byId.get(pid);
        if (!p) {
          throw new BadRequestException(`Produto ${pid} não encontrado.`);
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Produto ${p.name} está inativo e não pode constar em pedidos.`,
          );
        }
      }

      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;
      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const { qty, unitPriceHint } = mergedLines.get(pid)!;
        const unitPrice =
          unitPriceHint !== undefined && unitPriceHint !== null
            ? new Prisma.Decimal(Number(unitPriceHint).toFixed(2))
            : p.price;
        const totalLine = unitPrice.mul(qty).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          product: { connect: { id: pid } },
          lineNumber,
          sku: p.sku,
          description: p.name,
          quantity: qty,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
          stockStatus: OrderItemStockStatus.NAO_ANALISADO,
        });
        lineNumber += 10;
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          subtotal: totalFixed,
          total: totalFixed,
          totalValue: totalFixed,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_SITE_ITEMS_UPDATED',
        entity: 'Order',
        entityId: updated.id,
        changes: {
          externalOrderNumber: updated.externalOrderNumber,
          lines: updated.items.length,
          subtotal: totalFixed.toString(),
          source: 'site',
        },
      });

      return this.serializeOrder(updated);
    });
  }

  async updateManualPedido(
    userId: string,
    numeroPed: string,
    dto: CreateManualPedidoDto,
  ) {
    const numeroStr = numeroPed.trim();
    const order = await this.prisma.client.order.findFirst({
      where: { externalOrderNumber: numeroStr },
      include: { items: true, exits: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const externalOrderNumber = dto.externalOrderNumber.trim();
    if (!externalOrderNumber) {
      throw new BadRequestException('Número do pedido é obrigatório.');
    }
    if (externalOrderNumber !== numeroStr) {
      const duplicate = await this.prisma.client.order.findFirst({
        where: {
          externalOrderNumber,
          id: { not: order.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException('Já existe pedido com este número.');
      }
    }

    const deliveryRaw = dto.requestedDeliveryDate.trim();
    const requestedDeliveryDate = new Date(`${deliveryRaw}T12:00:00.000Z`);
    if (Number.isNaN(requestedDeliveryDate.getTime())) {
      throw new BadRequestException('Data de entrega prevista inválida.');
    }

    const [receiver, unloadingPoint, customer] = await Promise.all([
      this.prisma.client.receiver.findUnique({ where: { id: dto.receiverId } }),
      this.prisma.client.unloadingPoint.findUnique({
        where: { id: dto.unloadingPointId },
      }),
      this.prisma.client.customer.findUnique({ where: { id: dto.customerId } }),
    ]);

    if (!receiver?.isActive) {
      throw new BadRequestException('Recebedor inválido ou inativo.');
    }
    if (!unloadingPoint?.isActive) {
      throw new BadRequestException('Ponto de descarga inválido ou inativo.');
    }
    if (!customer?.isActive) {
      throw new BadRequestException('Cliente inválido ou inativo.');
    }

    const mergedLines = new Map<
      string,
      { qty: number; unitPriceHint?: number }
    >();
    for (const li of dto.items) {
      const prev = mergedLines.get(li.productId);
      if (prev) {
        mergedLines.set(li.productId, {
          qty: prev.qty + li.quantity,
          unitPriceHint: prev.unitPriceHint ?? li.unitPrice,
        });
      } else {
        mergedLines.set(li.productId, {
          qty: li.quantity,
          unitPriceHint: li.unitPrice,
        });
      }
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const productIds = [...mergedLines.keys()].sort();
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        orderBy: { id: 'asc' },
      });
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const pid of productIds) {
        const p = byId.get(pid);
        if (!p) {
          throw new BadRequestException(`Produto ${pid} não encontrado.`);
        }
        if (!p.isActive) {
          throw new BadRequestException(
            `Produto ${p.name} está inativo e não pode constar em pedidos.`,
          );
        }
      }

      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;
      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const pid of productIds) {
        const p = byId.get(pid)!;
        const { qty, unitPriceHint } = mergedLines.get(pid)!;
        const unitPrice =
          unitPriceHint !== undefined && unitPriceHint !== null
            ? new Prisma.Decimal(Number(unitPriceHint).toFixed(2))
            : p.price;
        const totalLine = unitPrice.mul(qty).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          product: { connect: { id: pid } },
          lineNumber,
          sku: p.sku,
          description: p.name,
          quantity: qty,
          reservedQuantity: 0,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
          stockStatus: OrderItemStockStatus.NAO_ANALISADO,
        });
        lineNumber += 10;
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);
      const customerDocument = customer.document?.trim() || null;
      const carrierId = await this.carrierResolver.resolveCarrierId(
        customerDocument,
        tx,
      );

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          externalOrderNumber,
          customerId: customer.id,
          customerName: customer.name.trim(),
          customerDocument,
          deliveryCnpj: customerDocument,
          deliveryAddress: customer.deliveryAddress?.trim() || null,
          receiverName: receiver.name.trim(),
          unloadingPoint: unloadingPoint.name.trim(),
          notes: dto.notes?.trim() || null,
          requestedDeliveryDate,
          subtotal: totalFixed,
          total: totalFixed,
          totalValue: totalFixed,
          carrierId,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_UPDATED',
        entity: 'Order',
        entityId: updated.id,
        changes: {
          externalOrderNumber,
          lines: updated.items.length,
          subtotal: totalFixed.toString(),
          source: 'manual_expedicao',
        },
      });

      return this.serializeOrder(updated);
    });
  }

  async updateOrderCarrier(
    orderId: string,
    userId: string,
    carrierId: string | null,
  ) {
    const order = await this.prisma.client.order.findUnique({
      where: { id: orderId },
      select: { id: true, carrierId: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (carrierId) {
      const carrier = await this.prisma.client.carrier.findUnique({
        where: { id: carrierId },
        select: { id: true, isActive: true },
      });
      if (!carrier?.isActive) {
        throw new BadRequestException('Transportadora inválida ou inativa.');
      }
    }

    const updated = await this.prisma.client.order.update({
      where: { id: orderId },
      data: { carrierId },
      include: OrderService.orderInclude(),
    });

    await this.audit.log({
      userId,
      action: 'ORDER_CARRIER_UPDATED',
      entity: 'Order',
      entityId: orderId,
      changes: {
        from: order.carrierId,
        to: carrierId,
      },
    });

    return this.serializeOrder(updated);
  }

  /** Pedido WEG teste — linhas WEG preservadas em `lineNumber`; sem reserva automática. */
  async createWeg(userId: string, dto: CreateWegOrderDto) {
    const lines = dto.items;
    const nums = new Set(lines.map((l) => l.lineNumber));
    if (nums.size !== lines.length) {
      throw new BadRequestException(
        'Número de linha WEG duplicado no mesmo pedido.',
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextOrderCode(tx);

      let subtotalDec = new Prisma.Decimal(0);
      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const li of lines) {
        const unitPrice = new Prisma.Decimal(Number(li.unitPrice).toFixed(2));
        const totalLine = unitPrice.mul(li.quantity).toDecimalPlaces(2);
        subtotalDec = subtotalDec.add(totalLine);

        creates.push({
          lineNumber: li.lineNumber,
          sku: li.sku.trim(),
          description: li.description.trim(),
          quantity: li.quantity,
          reservedQuantity: 0,
          unit: li.unit?.trim() || null,
          ncm: li.ncm?.trim() || null,
          unitPrice: unitPrice.toDecimalPlaces(2),
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
        });
      }

      const totalFixed = subtotalDec.toDecimalPlaces(2);

      const orderDate = dto.orderDate
        ? OrderService.safeParseDate(dto.orderDate)
        : new Date();
      const requestedDeliveryDate = dto.requestedDeliveryDate
        ? OrderService.safeParseDate(dto.requestedDeliveryDate)
        : null;
      const deliveryCnpj = dto.deliveryCnpj?.trim() || null;
      const carrierId = await this.carrierResolver.resolveCarrierId(
        deliveryCnpj ?? dto.customerDocument,
        tx,
      );

      const order = await tx.order.create({
        data: {
          source: OrderSource.WEG_MERCADO_ELETRONICO,
          code,
          externalOrderNumber: dto.externalOrderNumber?.trim() || null,
          mercadoEletronicoNumber: dto.mercadoEletronicoNumber?.trim() || null,
          customerName: dto.customerName.trim(),
          customerDocument: dto.customerDocument?.trim() || null,
          receiverName: dto.receiverName?.trim() || null,
          unloadingPoint: dto.unloadingPoint?.trim() || null,
          deliveryCnpj,
          deliveryCity: dto.deliveryCity?.trim() || null,
          deliveryState: dto.deliveryState?.trim()?.toUpperCase() || null,
          deliveryAddress: dto.deliveryAddress?.trim() || null,
          notes: dto.notes?.trim() || null,
          mercadoEletronicoStatus: dto.mercadoEletronicoStatus?.trim() || null,
          contaAzulStatus: dto.contaAzulStatus?.trim() || null,
          invoiceNumber: dto.invoiceNumber?.trim() || null,
          invoiceStatus: dto.invoiceNumber
            ? InvoiceStatus.PENDING
            : InvoiceStatus.NOT_FOUND,
          orderDate,
          requestedDeliveryDate,
          status: OrderStatus.NOVO,
          priority: 3,
          subtotal: totalFixed,
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          carrierId,
          items: { create: creates },
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_WEG_CREATED',
        entity: 'Order',
        entityId: order.id,
        changes: {
          code: order.code,
          externalOrderNumber: order.externalOrderNumber,
          lines: order.items.length,
        },
      });

      return this.serializeOrder(order);
    });
  }

  /** Analisar e reservar (flexível): não bloqueia por falta de estoque; registra falta por linha. */
  async reserve(orderId: string, userId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            orderBy: { lineNumber: 'asc' },
          },
        },
      });

      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.linkedOrderId) {
        throw new BadRequestException(
          'Pedido vinculado a envio urgente — não requer reserva de estoque.',
        );
      }
      if (order.status !== OrderStatus.NOVO && order.status !== OrderStatus.PARCIAL) {
        throw new BadRequestException(
          'Somente pedidos em NOVO ou PARCIAL podem ser analisados e reservados.',
        );
      }

      const orderRef = orderStockReference(order);
      const resCount = await tx.stockReservation.count({
        where: { orderId: order.id, releasedAt: null },
      });
      if (resCount > 0) {
        await this.releaseReservations(
          tx,
          userId,
          orderRef,
          order.id,
          order.items.map((it) => ({
            id: it.id,
            productId: it.productId,
            reservedQuantity: it.reservedQuantity,
          })),
        );
      }

      await this.flexibleAnalyzeAndReserve(
        tx,
        userId,
        orderRef,
        order.id,
        order.items,
      );

      const fresh = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_ANALYZE_RESERVE_SUCCESS',
        entity: 'Order',
        entityId: order.id,
        changes: { code: order.code, status: fresh.status },
      });

      return this.serializeOrder(fresh);
    });
  }

  async sendToPicking(orderId: string, userId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          code: true,
          status: true,
          shippedAt: true,
          invoicedAt: true,
          invoiceStatus: true,
          invoiceNumber: true,
          items: { select: { pickedQty: true } },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');
      if (
        before.status !== OrderStatus.RESERVADO &&
        before.status !== OrderStatus.PARCIAL
      ) {
        throw new BadRequestException(
          `Envie para separação apenas com status RESERVADO ou PARCIAL. Atual: ${before.status}.`,
        );
      }

      await OrderService.archiveCurrentInvoiceForNewSeparationCycle(tx, {
        orderId,
        userId,
        invoiceNumber: before.invoiceNumber,
        items: before.items,
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          ...OrderService.patchDataForStatus(OrderStatus.EM_SEPARACAO, {
            shippedAt: before.shippedAt,
            invoicedAt: before.invoicedAt,
            invoiceStatus: before.invoiceStatus,
          }),
          // Novo ciclo: NF corrente some do campo (histórico permanece).
          invoiceNumber: null,
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_OPS_TRANSITION',
        entity: 'Order',
        entityId: orderId,
        changes: {
          from: before.status,
          to: OrderStatus.EM_SEPARACAO,
          code: before.code,
        },
      });

      return this.serializeOrder(updatedOrder);
    });
  }

  async updatePriority(
    id: string,
    userId: string,
    dto: UpdateOrderPriorityDto,
  ) {
    const before = await this.prisma.client.order.findUnique({
      where: { id },
      select: { id: true, code: true, status: true },
    });
    if (!before) throw new NotFoundException('Pedido não encontrado.');
    if (
      before.status === OrderStatus.CANCELADO ||
      before.status === OrderStatus.FINALIZADO
    ) {
      throw new BadRequestException(
        'Não é possível alterar prioridade deste pedido.',
      );
    }

    const updated = await this.prisma.client.order.update({
      where: { id },
      data: { priority: dto.priority },
      include: OrderService.orderInclude(),
    });

    await this.audit.log({
      userId,
      action: 'ORDER_PRIORITY_CHANGED',
      entity: 'Order',
      entityId: id,
      changes: {
        code: before.code,
        priority: dto.priority,
      },
    });

    return this.serializeOrder(updated);
  }

  async markPicked(orderId: string, userId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const before = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              reservedQuantity: true,
              sku: true,
              quantity: true,
            },
          },
        },
      });

      if (!before) throw new NotFoundException('Pedido não encontrado.');
      if (before.status !== OrderStatus.EM_SEPARACAO) {
        throw new BadRequestException(
          `Finalizar separação só em EM_SEPARACAO. Atual: ${before.status}.`,
        );
      }

      const lines = await tx.orderItem.findMany({ where: { orderId } });
      const hasPickedQty = lines.some((it) => it.pickedQty > 0);
      if (!hasPickedQty) {
        throw new BadRequestException(
          'Confirme ao menos um item com quantidade maior que zero antes de finalizar a separação.',
        );
      }

      for (const it of lines) {
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            missingQty: Math.max(0, it.quantity - (it.pickedQty ?? 0)),
          },
        });
      }

      const partialLines = lines.filter(
        (it) => it.pickedQty > 0 && it.pickedQty < it.quantity,
      );
      const pendingLines = lines.filter((it) => it.pickedQty === 0);
      const obsParts: string[] = [];
      if (partialLines.length > 0) {
        obsParts.push(
          `Separação parcial: ${partialLines
            .map((it) => `${it.sku} (${it.pickedQty}/${it.quantity})`)
            .join(', ')}`,
        );
      }
      if (pendingLines.length > 0) {
        obsParts.push(
          `Itens pendentes neste lote: ${pendingLines
            .map((it) => `${it.sku} (0/${it.quantity})`)
            .join(', ')}`,
        );
      }

      const data = OrderService.patchDataForStatus(OrderStatus.SEPARADO, {
        shippedAt: before.shippedAt,
        invoicedAt: before.invoicedAt,
        invoiceStatus: before.invoiceStatus,
      });
      if (obsParts.length > 0) {
        const stamp = new Date().toLocaleString('pt-BR');
        const block = `[${stamp}] ${obsParts.join(' | ')}`;
        const prev = before.obsExpedicao?.trim();
        data.obsExpedicao = prev ? `${prev}\n${block}` : block;
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data,
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_OPS_TRANSITION',
        entity: 'Order',
        entityId: orderId,
        changes: {
          from: OrderStatus.EM_SEPARACAO,
          to: OrderStatus.SEPARADO,
          code: before.code,
        },
      });

      return this.serializeOrder(updatedOrder);
    });
  }

  /** Ajuste fino da quantidade separada por linha (somente EM_SEPARACAO). */
  async updateItemPickedQty(
    orderId: string,
    itemId: string,
    userId: string,
    dto: UpdateOrderItemPickedDto,
  ) {
    const raw = Math.round(Number(dto.pickedQty));
    if (!Number.isFinite(raw) || raw < 0) {
      throw new BadRequestException('pickedQty inválido.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, code: true, status: true },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.status !== OrderStatus.EM_SEPARACAO) {
        throw new BadRequestException(
          'Só é possível editar separação com o pedido em EM_SEPARACAO.',
        );
      }

      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId },
      });
      if (!item) throw new NotFoundException('Item não encontrado neste pedido.');

      const clamped = Math.min(raw, item.quantity);

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          pickedQty: clamped,
          missingQty: Math.max(0, item.quantity - clamped),
        },
      });

      const updated = await tx.order.findUnique({
        where: { id: orderId },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_ITEM_PICKED_UPDATE',
        entity: 'OrderItem',
        entityId: itemId,
        changes: {
          orderCode: order.code,
          sku: item.sku,
          pickedQty: clamped,
        },
      });

      return this.serializeOrder(updated!);
    });
  }

  /** Atrela NF ao pedido separado — não altera estoque físico. */
  async attachInvoice(
    orderId: string,
    userId: string,
    dto: AttachInvoiceDto,
  ) {
    const inv = dto.invoiceNumber.trim();
    if (!inv) {
      throw new BadRequestException('Informe o número da NF.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          code: true,
          status: true,
          invoiceNumber: true,
          items: {
            select: { quantity: true, pickedQty: true, invoicedQty: true },
          },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');
      if (
        before.status === OrderStatus.FINALIZADO ||
        before.status === OrderStatus.EXPEDIDO ||
        before.status === OrderStatus.CANCELADO
      ) {
        throw new BadRequestException(
          'Pedido encerrado. Não é possível gerar/atrelar nova NF.',
        );
      }
      if (
        before.status !== OrderStatus.SEPARADO &&
        before.status !== OrderStatus.AGUARDANDO_NF &&
        before.status !== OrderStatus.NF_ATRELADA &&
        before.status !== OrderStatus.PARCIAL
      ) {
        throw new BadRequestException(
          'Atrelar NF apenas em SEPARADO, AGUARDANDO_NF, PARCIAL ou NF_ATRELADA.',
        );
      }

      const fullyInvoiced =
        before.items.length > 0 &&
        before.items.every(
          (it) => it.quantity <= 0 || (it.invoicedQty ?? 0) >= it.quantity,
        );
      if (fullyInvoiced) {
        throw new BadRequestException(
          'Pedido já está totalmente faturado. Não é possível gerar/atrelar nova NF.',
        );
      }

      const previousInvoice = before.invoiceNumber?.trim() || null;

      const pickedQtyAtTime = before.items.reduce(
        (sum, it) => sum + (it.pickedQty ?? 0),
        0,
      );

      if (previousInvoice && previousInvoice !== inv) {
        await tx.orderInvoiceHistory.create({
          data: {
            orderId,
            invoiceNumber: previousInvoice,
            pickedQtyAtTime,
            createdBy: userId,
          },
        });
      }

      const itemsFull = await tx.orderItem.findMany({ where: { orderId } });
      for (const it of itemsFull) {
        if (it.invoicedQty === 0 && it.pickedQty > 0) {
          await tx.orderItem.update({
            where: { id: it.id },
            data: { invoicedQty: it.pickedQty },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.NF_ATRELADA,
          invoiceNumber: inv,
          invoicedAt: new Date(),
          invoiceStatus: InvoiceStatus.INVOICED,
        },
        include: OrderService.orderInclude(),
      });

      // Registra a NF atual no histórico (primeira ou nova).
      const alreadyLogged = await tx.orderInvoiceHistory.findFirst({
        where: { orderId, invoiceNumber: inv },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!alreadyLogged) {
        await tx.orderInvoiceHistory.create({
          data: {
            orderId,
            invoiceNumber: inv,
            pickedQtyAtTime,
            createdBy: userId,
          },
        });
      }

      await this.audit.log({
        userId,
        action: 'ORDER_ATTACH_INVOICE',
        entity: 'Order',
        entityId: orderId,
        changes: { code: before.code, invoiceNumber: inv },
      });

      return this.serializeOrder(updated);
    });
  }

  /**
   * Remove o pedido da fila de separação e reseta o progresso da tentativa atual.
   * - Sem saída anterior: volta a NOVO, zera pickedQty/invoicedQty e limpa NF desta tentativa
   *   (preserva NF/histórico de importação WEG anterior).
   * - Já teve saída / veio de PARCIAL: volta a PARCIAL, mantém histórico e pickedQty
   *   confirmado (piso = invoicedQty).
   */
  async removeFromSeparation(orderId: string, userId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          exits: { take: 1, select: { id: true, invoiceNumber: true } },
          invoiceHistory: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              invoiceNumber: true,
              createdAt: true,
              createdBy: true,
            },
          },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');

      const removable: OrderStatus[] = [
        OrderStatus.RESERVADO,
        OrderStatus.EM_SEPARACAO,
        OrderStatus.SEPARADO,
        OrderStatus.AGUARDANDO_NF,
        OrderStatus.NF_ATRELADA,
        OrderStatus.PARCIAL,
      ];
      if (!removable.includes(before.status)) {
        throw new BadRequestException(
          `Pedido não está na separação (status: ${before.status}).`,
        );
      }

      const exit = before.exits[0] ?? null;

      let enteredSeparationAt: Date | null = null;
      let cameFromParcial = false;
      const audits = await tx.auditLog.findMany({
        where: {
          entity: 'Order',
          entityId: orderId,
          action: {
            in: [
              'ORDER_OPS_TRANSITION',
              'ORDER_STATUS_MANUAL',
              'ORDER_STATUS_CHANGED',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { changes: true, createdAt: true },
      });
      for (const row of audits) {
        const changes = row.changes as { from?: string; to?: string } | null;
        if (changes?.to === OrderStatus.EM_SEPARACAO) {
          enteredSeparationAt = row.createdAt;
          cameFromParcial = changes.from === OrderStatus.PARCIAL;
          break;
        }
      }

      const hadPriorPartial =
        Boolean(before.shippedAt) || Boolean(exit) || cameFromParcial;

      if (hadPriorPartial) {
        for (const it of before.items) {
          const confirmed = Math.max(0, it.invoicedQty ?? 0);
          await tx.orderItem.update({
            where: { id: it.id },
            data: {
              pickedQty: confirmed,
              missingQty: Math.max(0, it.quantity - confirmed),
            },
          });
        }

        // Remove só NFs atreladas nesta tentativa; mantém histórico anterior.
        if (enteredSeparationAt) {
          await tx.orderInvoiceHistory.deleteMany({
            where: {
              orderId,
              createdAt: { gte: enteredSeparationAt },
            },
          });
        }

        // NF corrente volta à da última saída confirmada.
        const restoredInvoice = exit?.invoiceNumber?.trim() || null;

        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.PARCIAL,
            invoiceNumber: restoredInvoice,
            invoiceStatus: restoredInvoice
              ? InvoiceStatus.INVOICED
              : InvoiceStatus.NOT_FOUND,
            invoicedAt: restoredInvoice ? before.invoicedAt : null,
            volumes: null,
          },
          include: OrderService.orderInclude(),
        });

        await this.audit.log({
          userId,
          action: 'ORDER_REMOVE_FROM_SEPARATION',
          entity: 'Order',
          entityId: orderId,
          changes: {
            code: before.code,
            mode: 'parcial',
            from: before.status,
            to: OrderStatus.PARCIAL,
          },
        });

        return this.serializeOrder(updated);
      }

      // Tentativa sem separação/faturamento confirmado: reset completo.
      for (const it of before.items) {
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            pickedQty: 0,
            invoicedQty: 0,
            missingQty: 0,
          },
        });
      }

      // Remove só o histórico criado nesta tentativa de separação.
      if (enteredSeparationAt) {
        await tx.orderInvoiceHistory.deleteMany({
          where: {
            orderId,
            createdAt: { gte: enteredSeparationAt },
          },
        });
      } else {
        await tx.orderInvoiceHistory.deleteMany({
          where: {
            orderId,
            createdBy: { not: null },
          },
        });
      }

      const remainingHistory = await tx.orderInvoiceHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      let nextInvoice = remainingHistory[0]?.invoiceNumber?.trim() || null;

      // NF de importação WEG sem histórico restante: preserva o número no pedido.
      if (
        !nextInvoice &&
        before.source === OrderSource.WEG_MERCADO_ELETRONICO &&
        before.invoiceNumber?.trim()
      ) {
        const current = before.invoiceNumber.trim();
        const wasOnlyFromThisAttempt =
          enteredSeparationAt != null &&
          before.invoiceHistory.some(
            (h) =>
              h.invoiceNumber.trim() === current &&
              h.createdAt >= enteredSeparationAt,
          ) &&
          !before.invoiceHistory.some(
            (h) =>
              h.invoiceNumber.trim() === current &&
              h.createdAt < enteredSeparationAt,
          );
        if (!wasOnlyFromThisAttempt) {
          nextInvoice = current;
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.NOVO,
          invoiceNumber: nextInvoice,
          invoiceStatus: nextInvoice
            ? InvoiceStatus.PENDING
            : InvoiceStatus.NOT_FOUND,
          invoicedAt: nextInvoice ? before.invoicedAt : null,
          volumes: null,
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_REMOVE_FROM_SEPARATION',
        entity: 'Order',
        entityId: orderId,
        changes: {
          code: before.code,
          mode: 'novo',
          from: before.status,
          to: OrderStatus.NOVO,
          preservedInvoice: nextInvoice,
        },
      });

      return this.serializeOrder(updated);
    });
  }

  /** Gera NF-e + saída definitiva de estoque + histórico de saída (OrderExit). */
  async generateExitFromInvoice(
    orderId: string,
    userId: string,
    dto: AttachInvoiceDto,
  ) {
    const inv = dto.invoiceNumber.trim();
    if (!inv) {
      throw new BadRequestException('Informe o número da NF.');
    }

    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const before = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, carrier: { select: { name: true } } },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');

      if (
        before.status !== OrderStatus.SEPARADO &&
        before.status !== OrderStatus.AGUARDANDO_NF &&
        before.status !== OrderStatus.NF_ATRELADA
      ) {
        throw new BadRequestException(
          `Gerar NF-e disponível apenas para pedidos separados. Atual: ${before.status}.`,
        );
      }

      const existingExit = await tx.orderExit.findUnique({
        where: { orderId: before.id },
        select: { id: true },
      });
      if (existingExit) {
        throw new ConflictException('Este pedido já possui saída registrada.');
      }

      let movedUnits = 0;

      for (const it of before.items) {
        const productId = await this.resolveOrderItemProductId(tx, it);
        if (!productId) continue;

        const qtyOut = OrderService.resolveExitQuantity(it);
        if (qtyOut <= 0) continue;

        const reservation = await findActiveReservationByOrderItem(tx, it.id);
        const reservationQty = reservation?.quantity ?? 0;
        const decReserved = Math.min(reservationQty, qtyOut);

        const up = await tx.product.updateMany({
          where: {
            id: productId,
            stockQty: { gte: qtyOut },
            reservedQty: { gte: decReserved },
          },
          data: {
            stockQty: { decrement: qtyOut },
            reservedQty: { decrement: decReserved },
          },
        });
        if (up.count !== 1) {
          throw new ConflictException(
            `Saldo ou reserva inconsistente para o SKU ${it.sku}.`,
          );
        }

        movedUnits += qtyOut;

        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.SAIDA_EXPEDICAO,
            quantity: qtyOut,
            reference: before.code,
            invoiceNumber: inv,
            notes: `Saída pedido ${before.code} · NF ${inv}`,
            movedById: userId,
          },
        });

        if (reservation) {
          const remaining = reservationQty - decReserved;
          if (remaining <= 0) {
            await markStockReservationReleased(tx, reservation.id);
          } else {
            await tx.stockReservation.update({
              where: { id: reservation.id },
              data: { quantity: remaining },
            });
          }
        }

        const pickedFinal = it.pickedQty > 0 ? it.pickedQty : qtyOut;
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            productId,
            pickedQty: pickedFinal,
            missingQty: Math.max(0, it.quantity - pickedFinal),
            reservedQuantity: Math.max(0, it.reservedQuantity - decReserved),
            invoicedQty: qtyOut,
            mercadoEletronicoItemStatus:
              it.mercadoEletronicoItemStatus?.trim() || 'OK',
          },
        });
      }

      // Itens sem baixa (SKU sem produto / qtyOut 0) ainda precisam de missingQty.
      for (const it of before.items) {
        const qtyOut = OrderService.resolveExitQuantity(it);
        if (qtyOut > 0) continue;
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            missingQty: Math.max(0, it.quantity - (it.pickedQty ?? 0)),
          },
        });
      }

      if (movedUnits === 0 && before.items.length > 0) {
        throw new BadRequestException(
          'Não foi possível baixar estoque: vincule os SKUs ao cadastro de produtos ou confirme as quantidades do pedido.',
        );
      }

      const finalStatus = OrderService.resolveExitOrderStatus(before.items);
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: finalStatus,
          invoiceNumber: inv,
          invoiceStatus: InvoiceStatus.INVOICED,
          invoicedAt: new Date(),
          shippedAt: new Date(),
        },
        include: OrderService.orderInclude(),
      });

      const exit = await tx.orderExit.create({
        data: {
          orderId: updated.id,
          invoiceNumber: inv,
          invoiceValue: updated.totalValue,
          exitDate: new Date(),
          carrierName: before.carrier?.name ?? null,
          trackingCode: null,
        },
      });

      await this.audit.log({
        userId,
        action: 'ORDER_EXIT_GENERATED',
        entity: 'Order',
        entityId: orderId,
        changes: { code: before.code, invoiceNumber: inv, orderExitId: exit.id },
      });

      return {
        order: this.serializeOrder(updated),
        exit: {
          id: exit.id,
          orderId: exit.orderId,
          invoiceNumber: exit.invoiceNumber,
          invoiceValue: exit.invoiceValue.toString(),
          exitDate: exit.exitDate.toISOString(),
          carrierName: exit.carrierName,
          trackingCode: exit.trackingCode,
          createdAt: exit.createdAt.toISOString(),
          updatedAt: exit.updatedAt.toISOString(),
        },
      };
    });
  }

  /** Baixa física (SAIDA_EXPEDICAO), libera reservas proporcionais e encerra o pedido. */
  async finalizeExpedition(orderId: string, userId: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const before = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');
      if (before.status !== OrderStatus.NF_ATRELADA) {
        throw new BadRequestException(
          'EXPEDIÇÃO: finalize somente com NF atrelada (NF_ATRELADA).',
        );
      }
      const inv = before.invoiceNumber?.trim();
      if (!inv) {
        throw new BadRequestException('Pedido sem número de NF.');
      }

      let movedUnits = 0;

      for (const it of before.items) {
        const productId = await this.resolveOrderItemProductId(tx, it);
        if (!productId) continue;

        const qtyOut = OrderService.resolveExitQuantity(it);
        if (qtyOut <= 0) continue;

        const r = await findActiveReservationByOrderItem(tx, it.id);
        const reservationQty = r?.quantity ?? 0;
        const decReserved = Math.min(reservationQty, qtyOut);

        const up = await tx.product.updateMany({
          where: {
            id: productId,
            stockQty: { gte: qtyOut },
            reservedQty: { gte: decReserved },
          },
          data: {
            stockQty: { decrement: qtyOut },
            reservedQty: { decrement: decReserved },
          },
        });
        if (up.count !== 1) {
          throw new ConflictException(
            `Saldo ou reserva inconsistente para o SKU ${it.sku}. Revise quantidades e tente novamente.`,
          );
        }

        movedUnits += qtyOut;

        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.SAIDA_EXPEDICAO,
            quantity: qtyOut,
            reference: before.code,
            invoiceNumber: inv,
            notes: `Saída expedição pedido ${before.code} · NF ${inv}`,
            movedById: userId,
          },
        });

        if (r) {
          const remaining = reservationQty - decReserved;
          if (remaining <= 0) {
            await markStockReservationReleased(tx, r.id);
          } else {
            await tx.stockReservation.update({
              where: { id: r.id },
              data: { quantity: remaining },
            });
          }
        }

        const pickedFinal = it.pickedQty > 0 ? it.pickedQty : qtyOut;
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            productId,
            pickedQty: pickedFinal,
            missingQty: Math.max(0, it.quantity - pickedFinal),
            reservedQuantity: Math.max(0, it.reservedQuantity - decReserved),
            invoicedQty: qtyOut,
            mercadoEletronicoItemStatus:
              it.mercadoEletronicoItemStatus?.trim() || 'OK',
          },
        });
      }

      for (const it of before.items) {
        const qtyOut = OrderService.resolveExitQuantity(it);
        if (qtyOut > 0) continue;
        await tx.orderItem.update({
          where: { id: it.id },
          data: {
            missingQty: Math.max(0, it.quantity - (it.pickedQty ?? 0)),
          },
        });
      }

      if (movedUnits === 0 && before.items.length > 0) {
        throw new BadRequestException(
          'Não foi possível baixar estoque: vincule os SKUs ao cadastro de produtos ou confirme as quantidades do pedido.',
        );
      }

      const finalStatus = OrderService.resolveExitOrderStatus(before.items);
      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: finalStatus,
          shippedAt: new Date(),
        },
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_FINALIZE_EXPEDITION',
        entity: 'Order',
        entityId: orderId,
        changes: { code: before.code, invoiceNumber: inv },
      });

      return this.serializeOrder(updated);
    });
  }

  async updateStatus(
    id: string,
    userId: string,
    dto: UpdateOrderStatusDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              reservedQuantity: true,
              productId: true,
            },
          },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');

      const from = before.status as OrderStatus;
      const to = dto.status as OrderStatus;
      if (from === to) {
        const full = await this.loadOrderFull(tx, id);
        return this.serializeOrder(full);
      }

      this.assertTransition(from, to);

      if (to === OrderStatus.CANCELADO) {
        await this.releaseReservations(
          tx,
          userId,
          before.code,
          before.id,
          before.items,
        );
      }

      const data = OrderService.patchDataForStatus(to, {
        shippedAt: before.shippedAt,
        invoicedAt: before.invoicedAt,
        invoiceStatus: before.invoiceStatus,
      });

      const updated = await tx.order.update({
        where: { id },
        data,
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_STATUS_CHANGED',
        entity: 'Order',
        entityId: id,
        changes: { from, to, code: before.code },
      });

      return this.serializeOrder(updated);
    });
  }

  private async transitionStrict(
    orderId: string,
    userId: string,
    expectFrom: OrderStatus,
    to: OrderStatus,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            select: {
              id: true,
              reservedQuantity: true,
              productId: true,
            },
          },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');
      if (before.status !== expectFrom) {
        throw new BadRequestException(
          `Operação válida apenas com status ${expectFrom}. Atual: ${before.status}.`,
        );
      }

      this.assertTransition(expectFrom, to);

      const data = OrderService.patchDataForStatus(to, {
        shippedAt: before.shippedAt,
        invoicedAt: before.invoicedAt,
        invoiceStatus: before.invoiceStatus,
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data,
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_OPS_TRANSITION',
        entity: 'Order',
        entityId: orderId,
        changes: { from: expectFrom, to, code: before.code },
      });

      return this.serializeOrder(updated);
    });
  }

  /** Alteração manual de status (operação) — sem validação de cadeia de transição. */
  async updateStatusManual(
    id: string,
    userId: string,
    dto: UpdateOrderStatusDto,
  ) {
    return this.prisma.client.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id },
        include: {
          items: {
            select: {
              id: true,
              reservedQuantity: true,
              productId: true,
              pickedQty: true,
            },
          },
        },
      });
      if (!before) throw new NotFoundException('Pedido não encontrado.');

      const from = before.status as OrderStatus;
      const to = dto.status as OrderStatus;
      if (from === to) {
        const full = await this.loadOrderFull(tx, id);
        return this.serializeOrder(full);
      }

      if (to === OrderStatus.CANCELADO) {
        await this.releaseReservations(
          tx,
          userId,
          before.code,
          before.id,
          before.items,
        );
      }

      if (to === OrderStatus.EM_SEPARACAO) {
        await OrderService.archiveCurrentInvoiceForNewSeparationCycle(tx, {
          orderId: id,
          userId,
          invoiceNumber: before.invoiceNumber,
          items: before.items,
        });
      }

      const data: Prisma.OrderUncheckedUpdateInput = {
        ...OrderService.patchDataForStatus(to, {
          shippedAt: before.shippedAt,
          invoicedAt: before.invoicedAt,
          invoiceStatus: before.invoiceStatus,
        }),
      };
      if (to === OrderStatus.EM_SEPARACAO) {
        data.invoiceNumber = null;
      }

      const updated = await tx.order.update({
        where: { id },
        data,
        include: OrderService.orderInclude(),
      });

      await this.audit.log({
        userId,
        action: 'ORDER_STATUS_MANUAL',
        entity: 'Order',
        entityId: id,
        changes: { from, to, code: before.code },
      });

      return this.serializeOrder(updated);
    });
  }

  private assertTransition(from: OrderStatus, to: OrderStatus) {
    if (from === OrderStatus.FINALIZADO || from === OrderStatus.CANCELADO) {
      throw new BadRequestException('Pedido encerrado.');
    }
    if (to === OrderStatus.CANCELADO) return;

    if (to === OrderStatus.RESERVADO) {
      throw new BadRequestException(
        'Use POST /orders/:id/reserve (analisar e reservar).',
      );
    }

    if (from === OrderStatus.NOVO && to === OrderStatus.PARCIAL) return;
    if (from === OrderStatus.PARCIAL && to === OrderStatus.NOVO) return;

    if (
      (
        from === OrderStatus.NOVO ||
        from === OrderStatus.RESERVADO ||
        from === OrderStatus.PARCIAL
      ) &&
      to === OrderStatus.EM_SEPARACAO
    ) {
      return;
    }

    const chain: OrderStatus[] = [...ORDER_STATUS_EXPEDITION_CHAIN];

    const fi = chain.indexOf(from);
    const ti = chain.indexOf(to);
    if (fi >= 0 && ti === fi + 1) return;

    if (from === OrderStatus.SEPARADO && to === OrderStatus.NF_ATRELADA) return;
    if (from === OrderStatus.NF_ATRELADA && to === OrderStatus.FINALIZADO)
      return;

    throw new BadRequestException(`Transição de status inválida: ${from} → ${to}.`);
  }

  private buildWhere(query: OrderQueryDto): Prisma.OrderWhereInput {
    const clauses: Prisma.OrderWhereInput[] = [];

    const ws = query.workspace?.trim();
    if (ws === 'separation') {
      const separationMinDate = new Date('2025-07-01T00:00:00.000Z');
      clauses.push({
        AND: [
          {
            OR: [
              { orderDate: { gte: separationMinDate } },
              {
                AND: [
                  { orderDate: null },
                  { createdAt: { gte: separationMinDate } },
                ],
              },
            ],
          },
          {
            // Alinhado à aba Separação: só após "Enviar para Separação"
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
    } else if (ws === 'invoices') {
      clauses.push({
        status: { in: [OrderStatus.AGUARDANDO_NF, OrderStatus.NF_ATRELADA] },
      });
    } else if (ws === 'pendencies') {
      clauses.push({
        AND: [
          { status: { notIn: TERMINAL } },
          {
            OR: [
              { priority: { lte: 2 } },
              { items: { some: { missingQty: { gt: 0 } } } },
              {
                items: {
                  some: {
                    stockStatus: OrderItemStockStatus.SKU_NAO_ENCONTRADO,
                  },
                },
              },
            ],
          },
        ],
      });
    } else if (ws === 'billing') {
      clauses.push({ invoiceStatus: InvoiceStatus.CHARGE_RECEIPT });
    }

    const src = query.source?.trim();
    if (src && src !== 'all') {
      if (src === OrderSource.WEG_MERCADO_ELETRONICO) {
        clauses.push({ source: { in: [...WEG_TAB_ORDER_SOURCES] } });
      } else {
        clauses.push({ source: src as OrderSource });
      }
    }

    const ext = query.externalOrderNumber?.trim();
    if (ext) {
      clauses.push({
        externalOrderNumber: {
          startsWith: ext,
          mode: Prisma.QueryMode.insensitive,
        },
      });
    }

    const code = query.code?.trim();
    if (code) {
      clauses.push({
        code: { contains: code, mode: Prisma.QueryMode.insensitive },
      });
    }

    const cnpj = query.deliveryCnpj?.trim();
    if (cnpj) {
      clauses.push({
        deliveryCnpj: { startsWith: cnpj, mode: Prisma.QueryMode.insensitive },
      });
    }

    const recv = query.receiverName?.trim();
    if (recv) {
      clauses.push({
        receiverName: { startsWith: recv, mode: Prisma.QueryMode.insensitive },
      });
    }

    const unload = query.unloadingPoint?.trim();
    if (unload) {
      clauses.push({
        unloadingPoint: {
          startsWith: unload,
          mode: Prisma.QueryMode.insensitive,
        },
      });
    }

    const sku = query.sku?.trim();
    if (sku) {
      clauses.push({
        items: {
          some: {
            sku: { startsWith: sku, mode: Prisma.QueryMode.insensitive },
          },
        },
      });
    }

    const inv = query.invoiceNumber?.trim();
    if (inv) {
      clauses.push({
        invoiceNumber: { startsWith: inv, mode: Prisma.QueryMode.insensitive },
      });
    }

    const invSt = query.invoiceStatus?.trim();
    if (invSt && invSt !== 'all') {
      clauses.push({ invoiceStatus: invSt as InvoiceStatus });
    }

    const odFrom = query.orderDateFrom?.trim();
    const odTo = query.orderDateTo?.trim();
    if (odFrom || odTo) {
      clauses.push({
        orderDate: {
          ...(odFrom ? { gte: OrderService.safeParseDate(odFrom) } : {}),
          ...(odTo
            ? { lte: OrderService.endOfUtcDay(OrderService.safeParseDate(odTo)) }
            : {}),
        },
      });
    }

    const ddFrom = query.deliveryDateFrom?.trim();
    const ddTo = query.deliveryDateTo?.trim();
    if (ddFrom || ddTo) {
      clauses.push({
        requestedDeliveryDate: {
          ...(ddFrom ? { gte: OrderService.safeParseDate(ddFrom) } : {}),
          ...(ddTo
            ? {
                lte: OrderService.endOfUtcDay(
                  OrderService.safeParseDate(ddTo),
                ),
              }
            : {}),
        },
      });
    }

    const st = query.status?.trim();
    if (st && st !== 'all') {
      if ((ORDER_STATUS_VALUES as readonly string[]).includes(st)) {
        clauses.push({ status: st as OrderStatus });
      } else if (st === 'active') {
        clauses.push({ status: { notIn: TERMINAL } });
      } else if (st === 'delayed') {
        const todayUtc = OrderService.startOfUtcDay(new Date());
        clauses.push({
          requestedDeliveryDate: { lt: todayUtc },
          status: { notIn: DELAYED_EXCLUDED_STATUSES },
        });
      } else if (st === 'urgent') {
        clauses.push({
          priority: { lte: 2 },
          status: { notIn: TERMINAL },
        });
      } else if (st === 'today') {
        const day = OrderService.startOfUtcDay(new Date());
        clauses.push({ createdAt: { gte: day } });
      } else if (st === 'week') {
        const w = new Date();
        w.setDate(w.getDate() - 7);
        clauses.push({ createdAt: { gte: w } });
      } else if (st === 'closed') {
        clauses.push({ status: { in: TERMINAL } });
      }
    }

    let where: Prisma.OrderWhereInput =
      clauses.length > 0 ? { AND: clauses } : {};

    const term = query.search?.trim();
    if (term) {
      where = {
        AND: [where, OrderService.buildSmartSearchWhere(term)],
      };
    }

    return where;
  }

  /** Busca inteligente: números curtos = NF; números longos = pedido; texto = prefixo. */
  private static buildSmartSearchWhere(term: string): Prisma.OrderWhereInput {
    const raw = term.trim();
    if (!raw) return {};

    const withoutHash = raw.startsWith('#') ? raw.slice(1).trim() : raw;
    if (!withoutHash) return {};

    const digitsOnly = /^\d+$/.test(withoutHash);
    const invoiceMaxLen = 9;

    if (digitsOnly && withoutHash.length <= invoiceMaxLen) {
      return {
        OR: [
          {
            invoiceNumber: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            notaRemessa: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      };
    }

    if (digitsOnly) {
      return {
        OR: [
          {
            externalOrderNumber: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            code: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            mercadoEletronicoNumber: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      };
    }

    const orClauses: Prisma.OrderWhereInput[] = [
      {
        receiverName: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        customerName: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        unloadingPoint: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        externalOrderNumber: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        code: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        mercadoEletronicoNumber: {
          startsWith: withoutHash,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        items: {
          some: {
            sku: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      },
      {
        items: {
          some: {
            description: {
              startsWith: withoutHash,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
      },
    ];

    const cnpjDigits = withoutHash.replace(/\D/g, '');
    if (cnpjDigits.length >= 3) {
      orClauses.push({
        deliveryCnpj: {
          startsWith: cnpjDigits,
          mode: Prisma.QueryMode.insensitive,
        },
      });
      orClauses.push({
        customerDocument: {
          startsWith: cnpjDigits,
          mode: Prisma.QueryMode.insensitive,
        },
      });
    }

    return { OR: orClauses };
  }

  private buildOrderBy(
    query: OrderQueryDto,
  ): Prisma.OrderOrderByWithRelationInput[] {
    const dir = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const field = query.sortBy?.trim();

    switch (field) {
      case 'orderDate':
        return [{ orderDate: dir }, { createdAt: 'desc' }];
      case 'requestedDeliveryDate':
        return [{ requestedDeliveryDate: dir }, { createdAt: 'desc' }];
      case 'code':
        return [{ code: dir }];
      case 'externalOrderNumber':
        return [{ externalOrderNumber: dir }, { createdAt: 'desc' }];
      case 'totalValue':
        return [{ totalValue: dir }, { createdAt: 'desc' }];
      case 'priority':
        return [{ priority: dir }, { createdAt: 'desc' }];
      case 'status':
        return [{ status: dir }, { priority: 'asc' }];
      case 'createdAt':
      default:
        return [{ createdAt: 'desc' }, { priority: 'asc' }];
    }
  }

  private async loadOrderFull(tx: Tx, id: string) {
    return tx.order.findUniqueOrThrow({
      where: { id },
      include: OrderService.orderInclude(),
    });
  }

  private static orderInclude(): Prisma.OrderInclude {
    return {
      carrier: {
        select: { id: true, name: true },
      },
      linkedOrder: {
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
        },
      },
      exits: {
        select: { trackingCode: true },
        take: 1,
      },
      stockReservations: {
        where: { releasedAt: null },
        select: { id: true },
        take: 1,
      },
      items: {
        orderBy: { lineNumber: 'asc' },
        select: {
          id: true,
          lineNumber: true,
          sku: true,
          description: true,
          quantity: true,
          reservedQuantity: true,
          missingQty: true,
          pickedQty: true,
          invoicedQty: true,
          availableAtAnalysis: true,
          mercadoEletronicoItemStatus: true,
          stockStatus: true,
          unit: true,
          ncm: true,
          unitPrice: true,
          totalPrice: true,
          productId: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              stockQty: true,
              reservedQty: true,
            },
          },
        },
      },
    };
  }

  /**
   * Garante NF corrente no histórico antes de iniciar um novo ciclo de separação.
   * O campo invoiceNumber do pedido é limpo na transição; o histórico permanece.
   */
  private static async archiveCurrentInvoiceForNewSeparationCycle(
    tx: Tx,
    opts: {
      orderId: string;
      userId: string;
      invoiceNumber: string | null;
      items: Array<{ pickedQty: number }>;
    },
  ) {
    const inv = opts.invoiceNumber?.trim();
    if (!inv) return;

    const already = await tx.orderInvoiceHistory.findFirst({
      where: { orderId: opts.orderId, invoiceNumber: inv },
      select: { id: true },
    });
    if (already) return;

    const pickedQtyAtTime = opts.items.reduce(
      (sum, it) => sum + (it.pickedQty ?? 0),
      0,
    );
    await tx.orderInvoiceHistory.create({
      data: {
        orderId: opts.orderId,
        invoiceNumber: inv,
        pickedQtyAtTime,
        createdBy: opts.userId,
      },
    });
  }

  private static patchDataForStatus(
    to: OrderStatus,
    before: {
      shippedAt: Date | null;
      invoicedAt: Date | null;
      invoiceStatus: InvoiceStatus;
    },
  ): Prisma.OrderUncheckedUpdateInput {
    const data: Prisma.OrderUncheckedUpdateInput = { status: to };

    if (to === OrderStatus.EXPEDIDO && !before.shippedAt) {
      data.shippedAt = new Date();
    }
    if (to === OrderStatus.FINALIZADO && !before.shippedAt) {
      data.shippedAt = new Date();
    }
    if (to === OrderStatus.NF_ATRELADA && !before.invoicedAt) {
      data.invoicedAt = new Date();
      if (before.invoiceStatus === InvoiceStatus.NOT_FOUND) {
        data.invoiceStatus = InvoiceStatus.INVOICED;
      }
    }
    if (to === OrderStatus.RESERVADO) {
      data.reservedAt = new Date();
    }

    return data;
  }

  private static resolveExitQuantity(item: {
    quantity: number;
    pickedQty: number;
    invoicedQty: number;
  }): number {
    if (item.pickedQty > 0) return item.pickedQty;
    if (item.invoicedQty > 0) return item.invoicedQty;
    // Itens pendentes (sem separado/faturado) não devem gerar baixa de saída.
    return 0;
  }

  /** FINALIZADO só se todos os itens foram 100% separados/enviados; senão PARCIAL. */
  private static resolveExitOrderStatus(
    items: Array<{ quantity: number; pickedQty: number; invoicedQty: number }>,
  ): typeof OrderStatus.FINALIZADO | typeof OrderStatus.PARCIAL {
    if (items.length === 0) return OrderStatus.FINALIZADO;
    const fullyShipped = items.every((it) => {
      if (it.quantity <= 0) return true;
      return OrderService.resolveExitQuantity(it) >= it.quantity;
    });
    return fullyShipped ? OrderStatus.FINALIZADO : OrderStatus.PARCIAL;
  }

  private async resolveOrderItemProductId(
    tx: Tx,
    item: { id: string; sku: string; productId: string | null },
  ): Promise<string | null> {
    if (item.productId) return item.productId;

    const normalized = item.sku.trim();
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
    if (!found) return null;

    await tx.orderItem.update({
      where: { id: item.id },
      data: { productId: found.id },
    });
    return found.id;
  }

  private async nextOrderCode(tx: Tx): Promise<string> {
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

  private async flexibleAnalyzeAndReserve(
    tx: Tx,
    userId: string,
    orderCode: string,
    orderId: string,
    items: Array<{
      id: string;
      lineNumber: number;
      sku: string;
      productId: string | null;
      quantity: number;
    }>,
  ) {
    const sorted = [...items].sort((a, b) => a.lineNumber - b.lineNumber);

    for (const line of sorted) {
      let productId = line.productId;
      let skuNorm = line.sku.trim();
      let linked = productId
        ? await tx.product.findUnique({ where: { id: productId } })
        : null;

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
          linked = found;
          await tx.orderItem.update({
            where: { id: line.id },
            data: { productId },
          });
        }
      }

      if (!productId || !linked?.isActive) {
        await tx.orderItem.update({
          where: { id: line.id },
          data: {
            reservedQuantity: 0,
            missingQty: line.quantity,
            availableAtAnalysis: null,
            stockStatus: OrderItemStockStatus.SKU_NAO_ENCONTRADO,
          },
        });
        await markOrderItemReservationReleased(tx, line.id);
        continue;
      }

      const pRow = await tx.product.findUnique({ where: { id: productId } });
      if (!pRow) {
        await tx.orderItem.update({
          where: { id: line.id },
          data: {
            reservedQuantity: 0,
            missingQty: line.quantity,
            stockStatus: OrderItemStockStatus.SKU_NAO_ENCONTRADO,
          },
        });
        await markOrderItemReservationReleased(tx, line.id);
        continue;
      }

      const available = pRow.stockQty - pRow.reservedQty;
      const take = Math.min(line.quantity, Math.max(0, available));
      const missing = line.quantity - take;

      let st: OrderItemStockStatus;
      if (take >= line.quantity) st = OrderItemStockStatus.COMPLETO;
      else if (take <= 0) st = OrderItemStockStatus.SEM_ESTOQUE;
      else st = OrderItemStockStatus.PARCIAL;

      await tx.orderItem.update({
        where: { id: line.id },
        data: {
          availableAtAnalysis: available,
          missingQty: missing,
          reservedQuantity: take,
          stockStatus: st,
        },
      });

      if (take > 0) {
        await tx.product.update({
          where: { id: productId },
          data: { reservedQty: { increment: take } },
        });

        await upsertStockReservation(tx, {
          orderId,
          orderItemId: line.id,
          productId,
          sku: skuNorm,
          quantity: take,
          orderNumber: orderCode,
          createdById: userId,
        });

        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.RESERVA,
            quantity: take,
            reference: orderCode,
            notes: `Reserva flexível pedido ${orderCode}`,
            movedById: userId,
          },
        });
      } else {
        await markOrderItemReservationReleased(tx, line.id);
      }
    }

    const statusRows = await tx.orderItem.findMany({
      where: { orderId },
      select: { stockStatus: true },
    });
    const allCompleto =
      statusRows.length > 0 &&
      statusRows.every((r) => r.stockStatus === OrderItemStockStatus.COMPLETO);
    const nextStatus = allCompleto
      ? OrderStatus.RESERVADO
      : OrderStatus.PARCIAL;

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        reservedAt: new Date(),
      },
    });
  }

  private async releaseReservations(
    tx: Tx,
    userId: string,
    orderCode: string,
    orderId: string,
    items: Array<{
      id: string;
      productId: string | null;
      reservedQuantity: number;
    }>,
  ) {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, releasedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (reservations.length > 0) {
      const sorted = [...reservations].sort((a, b) =>
        a.productId.localeCompare(b.productId),
      );
      for (const r of sorted) {
        const upd = await tx.product.updateMany({
          where: {
            id: r.productId,
            reservedQty: { gte: r.quantity },
          },
          data: {
            reservedQty: {
              decrement: r.quantity,
            },
          },
        });
        if (upd.count !== 1) {
          throw new ConflictException(
            `Inconsistência ao liberar reserva física (${r.sku}).`,
          );
        }
        await tx.stockMovement.create({
          data: {
            productId: r.productId,
            movementType: StockMovementType.RESERVE_CANCEL,
            quantity: r.quantity,
            reference: orderCode,
            notes: `Liberação reserva física (${orderCode})`,
            movedById: userId,
          },
        });
        await markStockReservationReleased(tx, r.id);
      }

      const sortedItems = [...items].sort((a, b) =>
        String(a.productId).localeCompare(String(b.productId)),
      );
      for (const it of sortedItems) {
        if (it.reservedQuantity <= 0) continue;
        await tx.orderItem.update({
          where: { id: it.id },
          data: { reservedQuantity: 0 },
        });
      }
      return;
    }

    /** Pedidos reservados antes da reserva física (baixa direta em stockQty). */
    const sortedLegacy = [...items].sort((a, b) =>
      String(a.productId).localeCompare(String(b.productId)),
    );
    for (const it of sortedLegacy) {
      const q = it.reservedQuantity;
      if (q <= 0 || !it.productId) continue;

      await tx.product.update({
        where: { id: it.productId },
        data: { stockQty: { increment: q } },
      });
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          movementType: StockMovementType.RESERVE_CANCEL,
          quantity: q,
          reference: orderCode,
          notes: `Liberação de reserva (${orderCode})`,
          movedById: userId,
        },
      });
      await tx.orderItem.update({
        where: { id: it.id },
        data: { reservedQuantity: 0 },
      });
    }
  }

  /**
   * Libera reservas físicas e recria conforme as quantidades atuais dos itens.
   * Não altera o status do pedido (seguro para EM_SEPARACAO / pós-reserva).
   */
  async resyncPhysicalReservationsKeepingStatus(
    userId: string,
    orderId: string,
  ) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${RESERVE_ADVISORY_LOCK})`,
      );

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado.');

      await this.releaseReservations(
        tx,
        userId,
        orderStockReference(order),
        order.id,
        order.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          reservedQuantity: it.reservedQuantity,
        })),
      );

      const orderRef = orderStockReference(order);

      for (const line of order.items) {
        const qty = line.quantity;
        let productId = line.productId;
        let skuNorm = line.sku.trim();

        if (!productId) {
          const found = await tx.product.findFirst({
            where: {
              sku: {
                equals: line.sku.trim(),
                mode: Prisma.QueryMode.insensitive,
              },
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

        await tx.product.update({
          where: { id: productId },
          data: { reservedQty: { increment: qty } },
        });

        await upsertStockReservation(tx, {
          orderId: order.id,
          orderItemId: line.id,
          productId,
          sku: skuNorm,
          quantity: qty,
          orderNumber: orderNumberFromOrder(order),
          createdById: userId,
        });

        await tx.stockMovement.create({
          data: {
            productId,
            movementType: StockMovementType.RESERVA,
            quantity: qty,
            reference: orderRef,
            notes: `Ajuste reserva pedido ${orderRef}`,
            movedById: userId,
          },
        });
      }
    });

    return this.findOne(orderId);
  }

  private static computeMissingSkuForReserve(row: OrderSerializeSource): boolean {
    if (
      row.status !== OrderStatus.NOVO &&
      row.status !== OrderStatus.PARCIAL
    ) {
      return false;
    }
    return row.items.some(
      (it) =>
        !it.productId ||
        !it.product ||
        it.stockStatus === OrderItemStockStatus.SKU_NAO_ENCONTRADO,
    );
  }

  private serializeOrder(row: OrderSerializeSource) {
    const qtySum = row.items.reduce((a, x) => a + x.quantity, 0);
    const unidadesFaltantes = row.items.reduce((a, x) => {
      const fulfilled = Math.max(x.pickedQty ?? 0, x.invoicedQty ?? 0);
      if (fulfilled > 0 || (x.pickedQty ?? 0) > 0) {
        return a + Math.max(0, x.quantity - fulfilled);
      }
      return a + (x.missingQty ?? 0);
    }, 0);

    const physicalReservationActive =
      (row.stockReservations?.length ?? 0) > 0;
    const stockReserveBlocked = Boolean(row.linkedOrderId);
    const missingSkuForReserve =
      OrderService.computeMissingSkuForReserve(row);
    const linkedOrderDisplayNumber =
      row.linkedOrder?.externalOrderNumber?.trim() ||
      row.linkedOrder?.code ||
      null;

    return {
      id: row.id,
      source: row.source,
      code: row.code,
      externalOrderNumber: row.externalOrderNumber,
      mercadoEletronicoNumber: row.mercadoEletronicoNumber,
      customerId: row.customerId,
      customerName: row.customerName,
      customerDocument: row.customerDocument,
      customerCity: row.customerCity,
      customerState: row.customerState,
      receiverName: row.receiverName,
      unloadingPoint: row.unloadingPoint,
      deliveryCnpj: row.deliveryCnpj,
      deliveryCity: row.deliveryCity,
      deliveryState: row.deliveryState,
      deliveryAddress: row.deliveryAddress,
      notes: row.notes,
      notaRemessa: row.notaRemessa,
      notaRemessaConfirmada: row.notaRemessaConfirmada ?? false,
      volumes: row.volumes ?? null,
      carrierId: row.carrierId,
      carrierName: row.carrier?.name ?? null,
      trackingCode: row.exits?.[0]?.trackingCode ?? row.trackingCode ?? null,
      linkedOrderId: row.linkedOrderId,
      isUrgentManual: row.isUrgentManual,
      linkedOrderDisplayNumber,
      status: row.status,
      priority: row.priority,
      mercadoEletronicoStatus: row.mercadoEletronicoStatus,
      contaAzulStatus: row.contaAzulStatus,
      invoiceNumber: row.invoiceNumber,
      invoiceStatus: row.invoiceStatus,
      orderDate: row.orderDate?.toISOString() ?? null,
      requestedDeliveryDate: row.requestedDeliveryDate?.toISOString() ?? null,
      subtotal: row.subtotal.toString(),
      discount: row.discount.toString(),
      total: row.total.toString(),
      totalValue: row.totalValue.toString(),
      reservedAt: row.reservedAt?.toISOString() ?? null,
      shippedAt: row.shippedAt?.toISOString() ?? null,
      invoicedAt: row.invoicedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      physicalReservationActive,
      stockReserveBlocked,
      missingSkuForReserve,
      integralReserveBlocked: false,
      unidadesFaltantes,
      itemCount: row.items.length,
      quantitySum: qtySum,
      items: row.items.map((it) => {
        const openNeed = Math.max(
          0,
          it.quantity - (it.reservedQuantity ?? 0),
        );
        const pq = it.product?.stockQty ?? null;
        const pr = it.product?.reservedQty ?? null;
        const availableQty =
          pq !== null && pr !== null ? pq - pr : pq;

        return {
          id: it.id,
          lineNumber: it.lineNumber,
          sku: it.sku,
          description: it.description,
          quantity: it.quantity,
          reservedQuantity: it.reservedQuantity,
          missingQty: (() => {
            const fulfilled = Math.max(it.pickedQty ?? 0, it.invoicedQty ?? 0);
            if (fulfilled > 0) return Math.max(0, it.quantity - fulfilled);
            return it.missingQty ?? 0;
          })(),
          pickedQty: it.pickedQty ?? 0,
          invoicedQty: it.invoicedQty ?? 0,
          mercadoEletronicoItemStatus: it.mercadoEletronicoItemStatus ?? null,
          availableAtAnalysis: it.availableAtAnalysis ?? null,
          stockStatus: it.stockStatus ?? OrderItemStockStatus.NAO_ANALISADO,
          unit: it.unit,
          ncm: it.ncm,
          unitPrice: it.unitPrice.toString(),
          totalPrice: it.totalPrice.toString(),
          productId: it.productId,
          stockQtyOnHand: pq,
          reservedQtyProduct: pr,
          availableQty,
          stockAvailable: availableQty,
          openNeed,
          stockCoversOpenNeed:
            availableQty !== null ? availableQty >= it.quantity : false,
          product: it.product
            ? {
                id: it.product.id,
                name: it.product.name,
                sku: it.product.sku,
                stockQty: it.product.stockQty,
                reservedQty: it.product.reservedQty,
                availableQty:
                  it.product.stockQty - it.product.reservedQty,
              }
            : null,
        };
      }),
    };
  }

  private static safeParseDate(raw: string): Date {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Data inválida: ${raw}`);
    }
    return d;
  }

  private static startOfUtcDay(d: Date): Date {
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
    );
  }

  private static endOfUtcDay(d: Date): Date {
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
}