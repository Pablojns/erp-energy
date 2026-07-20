import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  OrderSource,
  OrderStatus,
  Prisma,
} from '@erp/database';
import { CrmService } from '../crm/crm.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateQuoteDto } from './dto/create-quote.dto';
import type { CreateQuoteItemDto } from './dto/create-quote-item.dto';
import type { ListQuotesQueryDto } from './dto/list-quotes-query.dto';
import type { QuoteDashboardPeriod } from './dto/quote-dashboard-query.dto';
import type { UpdateQuoteDto } from './dto/update-quote.dto';
import type { UpdateQuoteItemDto } from './dto/update-quote-item.dto';
import type { QuoteStatus } from './dto/create-quote.dto';
import {
  calcEngravingUnitPrice,
  roundMoney,
} from './engraving-price.util';
import {
  calcQuoteItemUnitPriceDecimal,
  DEFAULT_SALES_MARGIN_PERCENT,
  quotePricingFactor,
  roundMoneyDecimal,
  toDecimal,
  toNumDecimal,
} from './quote-pricing.util';
import { canViewQuoteMargin } from './quote-margin-access';
const NEXT_QUOTE_CODE_LOCK = 88442201;
const NEXT_ORDER_CODE_LOCK = 77441100;

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly crm: CrmService,
  ) {}

  private decimal(value: number | null | undefined): Prisma.Decimal | null {
    if (value === null || value === undefined) return null;
    return new Prisma.Decimal(value);
  }

  private serialize(row: {
    id: string;
    code: string;
    requestDate: Date;
    customerOrderRef: string | null;
    billingCompany: string | null;
    status: string;
    customerType: string;
    customerId: string | null;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    customerDocument: string | null;
    responsibleUserId: string | null;
    origin: string;
    observations: string | null;
    customerNotes: string | null;
    carrierId: string | null;
    deliveryAddress: string | null;
    freightValue: Prisma.Decimal | null;
    freightToConsult: boolean;
    deliveryDeadline: string | null;
    freightType: string | null;
    subtotal: Prisma.Decimal;
    total: Prisma.Decimal;
    paymentTerms: string | null;
    paymentMethod: string | null;
    commissionPercent?: Prisma.Decimal | null;
    marginReservePercent?: Prisma.Decimal | null;
    salesMarginPercent?: Prisma.Decimal | null;
    difalValue?: Prisma.Decimal | null;
    difalIsPercent?: boolean;
    otherExtraCosts?: Prisma.Decimal | null;
    linkedCrmCardId: string | null;
    linkedOrderId: string | null;
    createdAt: Date;
    updatedAt: Date;
    items?: Array<{
      id: string;
      quoteId: string;
      sku: string;
      description: string;
      imageUrl: string | null;
      engraving: string | null;
      engravingTechniqueId?: string | null;
      engravingPrice?: Prisma.Decimal | null;
      productPrice?: Prisma.Decimal | null;
      supplier: string | null;
      requiresArtwork: boolean;
      artworkFileName: string | null;
      artworkMimeType: string | null;
      artworkData: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
      order: number;
    }>;
    proposals?: Array<{
      id: string;
      quoteId: string;
      sentAt: Date | null;
      emailSent: boolean;
      createdBy: string | null;
      contactName: string | null;
      contactEmail: string | null;
      total: Prisma.Decimal;
      createdAt: Date;
    }>;
  }, viewer?: { id?: string; email?: string; name?: string } | null) {
    const showSalesMargin = canViewQuoteMargin(viewer);
    const commission = toDecimal(row.commissionPercent, 2);
    const reserve = toDecimal(row.marginReservePercent, 6);
    const sales = toDecimal(
      row.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(row.difalValue);
    const otherExtras = toDecimal(row.otherExtraCosts);

    return {
      id: row.id,
      code: row.code,
      requestDate: row.requestDate.toISOString(),
      customerOrderRef: row.customerOrderRef,
      billingCompany: row.billingCompany,
      status: row.status,
      customerType: row.customerType,
      customerId: row.customerId,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      customerDocument: row.customerDocument,
      responsibleUserId: row.responsibleUserId,
      origin: row.origin,
      observations: row.observations,
      customerNotes: row.customerNotes,
      carrierId: row.carrierId,
      deliveryAddress: row.deliveryAddress,
      freightValue: row.freightValue?.toString() ?? '0',
      freightToConsult: row.freightToConsult,
      deliveryDeadline: row.deliveryDeadline,
      freightType: row.freightType,
      subtotal: row.subtotal.toString(),
      total: row.total.toString(),
      paymentTerms: row.paymentTerms,
      paymentMethod: row.paymentMethod,
      commissionPercent: commission.toString(),
      marginReservePercent: reserve.toString(),
      ...(showSalesMargin
        ? {
            salesMarginPercent: sales.toString(),
          }
        : {}),
      difalValue: difal.toString(),
      otherExtraCosts: otherExtras.toString(),
      linkedCrmCardId: row.linkedCrmCardId,
      linkedOrderId: row.linkedOrderId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: (row.items ?? []).map((it) => {
        const qty = it.quantity > 0 ? it.quantity : 1;
        let unitPrice = roundMoneyDecimal(it.unitPrice, 2);
        let lineTotal = roundMoneyDecimal(it.total, 2);
        // Sempre devolver preço de venda (margem por dentro) quando houver custo de produto
        if (it.productPrice != null) {
          unitPrice = roundMoneyDecimal(
            calcQuoteItemUnitPriceDecimal({
              productPrice: it.productPrice,
              engravingPrice: it.engravingPrice,
              commissionPercent: commission,
              marginReservePercent: reserve,
              salesMarginPercent: sales,
              quantity: qty,
              difalValue: difal,
              otherExtraCosts: otherExtras,
            }),
            2,
          );
          lineTotal = unitPrice.mul(qty);
        }
        return {
          id: it.id,
          quoteId: it.quoteId,
          sku: it.sku,
          description: it.description,
          imageUrl: it.imageUrl,
          engraving: it.engraving,
          engravingTechniqueId: it.engravingTechniqueId ?? null,
          engravingPrice: it.engravingPrice?.toString() ?? null,
          productPrice: it.productPrice?.toString() ?? null,
          supplier: it.supplier ?? null,
          requiresArtwork: Boolean(it.requiresArtwork),
          artworkFileName: it.artworkFileName ?? null,
          artworkMimeType: it.artworkMimeType ?? null,
          artworkData: it.artworkData ?? null,
          quantity: it.quantity,
          unitPrice: unitPrice.toFixed(2),
          total: roundMoneyDecimal(lineTotal, 2).toFixed(2),
          order: it.order,
        };
      }),
      proposals: (row.proposals ?? []).map((p) => ({
        id: p.id,
        quoteId: p.quoteId,
        sentAt: p.sentAt?.toISOString() ?? null,
        emailSent: p.emailSent,
        createdBy: p.createdBy,
        contactName: p.contactName,
        contactEmail: p.contactEmail,
        total: p.total.toString(),
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  private async nextCode(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${NEXT_QUOTE_CODE_LOCK})`,
    );
    const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
      SELECT (COALESCE(MAX(CAST(SPLIT_PART("code", '-', 2) AS INTEGER)), 0) + 1)::bigint AS next
      FROM "Quote"
      WHERE "code" ~ '^ORC-[0-9]+$'
    `;
    const n = Number(rows[0]?.next ?? 1);
    return `ORC-${String(n).padStart(2, '0')}`;
  }

  private buildData(dto: CreateQuoteDto | UpdateQuoteDto): Prisma.QuoteUncheckedCreateInput | Prisma.QuoteUncheckedUpdateInput {
    const data: Prisma.QuoteUncheckedCreateInput | Prisma.QuoteUncheckedUpdateInput = {};

    if (dto.requestDate !== undefined) {
      data.requestDate = dto.requestDate ? new Date(dto.requestDate) : new Date();
    }
    if (dto.customerOrderRef !== undefined) {
      data.customerOrderRef = dto.customerOrderRef?.trim() || null;
    }
    if (dto.billingCompany !== undefined) {
      data.billingCompany = dto.billingCompany?.trim() || null;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.customerType !== undefined) data.customerType = dto.customerType;
    if (dto.customerId !== undefined) data.customerId = dto.customerId?.trim() || null;
    if (dto.customerName !== undefined) data.customerName = dto.customerName.trim();
    if (dto.customerEmail !== undefined) {
      data.customerEmail = dto.customerEmail?.trim() || null;
    }
    if (dto.customerPhone !== undefined) {
      data.customerPhone = dto.customerPhone?.trim() || null;
    }
    if (dto.customerDocument !== undefined) {
      data.customerDocument = dto.customerDocument?.trim() || null;
    }
    if (dto.responsibleUserId !== undefined) {
      data.responsibleUserId = dto.responsibleUserId?.trim() || null;
    }
    if (dto.origin !== undefined) data.origin = dto.origin;
    if (dto.observations !== undefined) {
      data.observations = dto.observations?.trim() || null;
    }
    if (dto.customerNotes !== undefined) {
      data.customerNotes = dto.customerNotes?.trim() || null;
    }
    if (dto.carrierId !== undefined) data.carrierId = dto.carrierId?.trim() || null;
    if (dto.deliveryAddress !== undefined) {
      data.deliveryAddress = dto.deliveryAddress?.trim() || null;
    }
    if (dto.freightValue !== undefined) {
      data.freightValue = this.decimal(dto.freightValue) ?? new Prisma.Decimal(0);
    }
    if (dto.freightToConsult !== undefined) data.freightToConsult = dto.freightToConsult;
    if (dto.deliveryDeadline !== undefined) {
      data.deliveryDeadline = dto.deliveryDeadline?.trim() || null;
    }
    if (dto.freightType !== undefined) {
      data.freightType = dto.freightType?.trim() || null;
    }
    if (dto.paymentTerms !== undefined) {
      data.paymentTerms = dto.paymentTerms?.trim() || null;
    }
    if (dto.paymentMethod !== undefined) {
      data.paymentMethod = dto.paymentMethod?.trim() || null;
    }
    if (dto.linkedCrmCardId !== undefined) {
      data.linkedCrmCardId = dto.linkedCrmCardId?.trim() || null;
    }
    if (dto.linkedOrderId !== undefined) {
      data.linkedOrderId = dto.linkedOrderId?.trim() || null;
    }
    if (dto.commissionPercent !== undefined) {
      data.commissionPercent = new Prisma.Decimal(dto.commissionPercent);
    }
    if (dto.marginReservePercent !== undefined) {
      data.marginReservePercent = new Prisma.Decimal(dto.marginReservePercent);
    }
    if (dto.salesMarginPercent !== undefined) {
      data.salesMarginPercent = new Prisma.Decimal(dto.salesMarginPercent);
    }
    if (dto.difalValue !== undefined) {
      data.difalValue = this.decimal(dto.difalValue);
    }
    if (dto.difalIsPercent !== undefined) {
      data.difalIsPercent = dto.difalIsPercent;
    }
    if (dto.otherExtraCosts !== undefined) {
      data.otherExtraCosts =
        this.decimal(dto.otherExtraCosts) ?? new Prisma.Decimal(0);
    }

    return data;
  }

  async findMany(
    query: ListQuotesQueryDto,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 && query.pageSize <= 100
        ? query.pageSize
        : 20;

    const where: Prisma.QuoteWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.linkedCrmCardId?.trim()) {
      where.linkedCrmCardId = query.linkedCrmCardId.trim();
    }

    const search = query.search?.trim();
    if (search) {
      const normalized = this.normalizeQuoteSearch(search);
      const or: Prisma.QuoteWhereInput[] = [
        { code: { contains: normalized.raw, mode: 'insensitive' } },
        { customerName: { contains: normalized.raw, mode: 'insensitive' } },
        { customerOrderRef: { contains: normalized.raw, mode: 'insensitive' } },
        { billingCompany: { contains: normalized.raw, mode: 'insensitive' } },
      ];
      if (normalized.codeHint) {
        or.push({
          code: { contains: normalized.codeHint, mode: 'insensitive' },
        });
      }
      where.OR = or;
    }

    if (query.dateFrom || query.dateTo) {
      where.requestDate = {};
      if (query.dateFrom) {
        where.requestDate.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        const end = new Date(query.dateTo);
        end.setHours(23, 59, 59, 999);
        where.requestDate.lte = end;
      }
    }

    const [total, rows] = await Promise.all([
      this.prisma.client.quote.count({ where }),
      this.prisma.client.quote.findMany({
        where,
        orderBy: { requestDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: { orderBy: { order: 'asc' } },
          proposals: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
    ]);

    return {
      data: rows.map((row) => this.serialize(row, viewer)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findOne(
    id: string,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const row = await this.prisma.client.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' } },
        proposals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Orçamento não encontrado.');
    return this.serialize(row, viewer);
  }

  async create(
    dto: CreateQuoteDto,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    if (!canViewQuoteMargin(viewer)) {
      delete (dto as { salesMarginPercent?: number }).salesMarginPercent;
    }

    let linkedCrmCardId = dto.linkedCrmCardId?.trim() || null;

    if (linkedCrmCardId) {
      const existingCard = await this.prisma.client.crmCard.findUnique({
        where: { id: linkedCrmCardId },
        select: { id: true },
      });
      if (!existingCard) {
        throw new BadRequestException('Lead CRM vinculado não encontrado.');
      }
    } else {
      linkedCrmCardId = await this.crm.createCardFromDirectQuote({
        name: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
        responsavelId: dto.responsibleUserId,
      });
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextCode(tx);
      const data = this.buildData({
        ...dto,
        linkedCrmCardId,
      }) as Prisma.QuoteUncheckedCreateInput;
      return tx.quote.create({
        data: {
          ...data,
          code,
          customerType: dto.customerType,
          customerName: dto.customerName.trim(),
          status: dto.status ?? 'AGUARDANDO',
          origin: dto.origin ?? 'SISTEMA',
          requestDate: dto.requestDate ? new Date(dto.requestDate) : new Date(),
          linkedCrmCardId,
          // Garante margem de venda padrão da Julia mesmo se o DTO omitir o campo
          salesMarginPercent:
            (data as { salesMarginPercent?: Prisma.Decimal }).salesMarginPercent ??
            new Prisma.Decimal(DEFAULT_SALES_MARGIN_PERCENT),
        },
        include: {
          items: { orderBy: { order: 'asc' } },
          proposals: true,
        },
      });
    });
    return this.serialize(created, viewer);
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const existing = await this.prisma.client.quote.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        commissionPercent: true,
        marginReservePercent: true,
        salesMarginPercent: true,
      },
    });
    if (!existing) throw new NotFoundException('Orçamento não encontrado.');

    if (dto.salesMarginPercent !== undefined && !canViewQuoteMargin(viewer)) {
      throw new BadRequestException(
        'Sem permissão para alterar a margem de venda.',
      );
    }

    const pricingTouched =
      dto.commissionPercent !== undefined ||
      dto.marginReservePercent !== undefined ||
      dto.salesMarginPercent !== undefined;

    const freightTouched =
      dto.freightValue !== undefined || dto.freightToConsult !== undefined;

    const extrasTouched =
      dto.difalValue !== undefined || dto.otherExtraCosts !== undefined;

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: this.buildData(dto) as Prisma.QuoteUncheckedUpdateInput,
      });
      if (pricingTouched || extrasTouched) {
        await this.recalcItemUnitPrices(tx, id, {
          commissionPercent: toNumDecimal(existing.commissionPercent, 2),
          marginReservePercent: toNumDecimal(existing.marginReservePercent, 6),
          salesMarginPercent: toNumDecimal(
            existing.salesMarginPercent,
            DEFAULT_SALES_MARGIN_PERCENT,
          ),
        });
      }
      if (freightTouched || pricingTouched || extrasTouched) {
        await this.recalcTotals(tx, id);
      }
      return tx.quote.findUniqueOrThrow({
        where: { id },
        include: {
          items: { orderBy: { order: 'asc' } },
          proposals: { orderBy: { createdAt: 'desc' } },
        },
      });
    });

    if (dto.status && dto.status !== existing.status) {
      await this.handleStatusSideEffects(
        updated,
        existing.status,
        viewer?.id,
      );
    }

    return this.serialize(updated, viewer);
  }

  async updateStatus(
    id: string,
    status: QuoteStatus,
    actorUserId?: string | null,
  ) {
    const existing = await this.prisma.client.quote.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Orçamento não encontrado.');

    const updated = await this.prisma.client.quote.update({
      where: { id },
      data: { status },
      include: {
        items: { orderBy: { order: 'asc' } },
        proposals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (status !== existing.status) {
      await this.handleStatusSideEffects(updated, existing.status, actorUserId);
    }

    return this.serialize(updated);
  }

  /**
   * Cópia completa do orçamento (itens/gravações/condições) com novo código,
   * status AGUARDANDO e sem propostas.
   */
  async duplicate(
    id: string,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const source = await this.prisma.client.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' } },
      },
    });
    if (!source) throw new NotFoundException('Orçamento não encontrado.');

    const created = await this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextCode(tx);
      const quote = await tx.quote.create({
        data: {
          code,
          requestDate: new Date(),
          customerOrderRef: source.customerOrderRef,
          billingCompany: source.billingCompany,
          status: 'AGUARDANDO',
          customerType: source.customerType,
          customerId: source.customerId,
          customerName: source.customerName,
          customerEmail: source.customerEmail,
          customerPhone: source.customerPhone,
          customerDocument: source.customerDocument,
          responsibleUserId: source.responsibleUserId,
          origin: source.origin,
          observations: source.observations,
          customerNotes: source.customerNotes,
          carrierId: source.carrierId,
          deliveryAddress: source.deliveryAddress,
          freightValue: source.freightValue,
          freightToConsult: source.freightToConsult,
          deliveryDeadline: source.deliveryDeadline,
          freightType: source.freightType,
          subtotal: source.subtotal,
          total: source.total,
          paymentTerms: source.paymentTerms,
          paymentMethod: source.paymentMethod,
          commissionPercent: source.commissionPercent,
          marginReservePercent: source.marginReservePercent,
          salesMarginPercent: source.salesMarginPercent,
          difalValue: source.difalValue,
          difalIsPercent: source.difalIsPercent,
          otherExtraCosts: source.otherExtraCosts,
          linkedCrmCardId: source.linkedCrmCardId,
          linkedOrderId: null,
          items: {
            create: source.items.map((item) => ({
              sku: item.sku,
              description: item.description,
              imageUrl: item.imageUrl,
              engraving: item.engraving,
              engravingTechniqueId: item.engravingTechniqueId,
              engravingPrice: item.engravingPrice,
              productPrice: item.productPrice,
              supplier: item.supplier,
              requiresArtwork: item.requiresArtwork,
              artworkFileName: item.artworkFileName,
              artworkMimeType: item.artworkMimeType,
              artworkData: item.artworkData,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              order: item.order,
            })),
          },
        },
        include: {
          items: { orderBy: { order: 'asc' } },
          proposals: true,
        },
      });
      return quote;
    });

    return this.serialize(created, viewer);
  }

  async remove(id: string) {
    const existing = await this.prisma.client.quote.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Orçamento não encontrado.');
    await this.prisma.client.quote.delete({ where: { id } });
    return { ok: true };
  }

  private async recalcTotals(
    tx: Prisma.TransactionClient,
    quoteId: string,
  ): Promise<void> {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      select: {
        freightValue: true,
        freightToConsult: true,
      },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');

    // Soma totais de linha com precisão completa; arredonda só o resultado
    const items = await tx.quoteItem.findMany({
      where: { quoteId },
      select: { total: true },
    });
    let subtotalPrecise = new Prisma.Decimal(0);
    for (const item of items) {
      subtotalPrecise = subtotalPrecise.add(item.total);
    }
    const freight =
      quote.freightToConsult || !quote.freightValue
        ? new Prisma.Decimal(0)
        : quote.freightValue;
    const totalPrecise = subtotalPrecise.add(freight);
    const subtotal = roundMoneyDecimal(subtotalPrecise, 2);
    const total = roundMoneyDecimal(totalPrecise, 2);

    await tx.quote.update({
      where: { id: quoteId },
      data: { subtotal, total },
    });
  }

  /** Preço unitário com precisão completa (não arredonda). */
  private resolveItemUnitPrice(input: {
    productPrice: Prisma.Decimal;
    engravingPrice: Prisma.Decimal | null;
    commissionPercent: Prisma.Decimal | number | string;
    marginReservePercent: Prisma.Decimal | number | string;
    salesMarginPercent: Prisma.Decimal | number | string;
    quantity: number;
    difalValue: Prisma.Decimal | number | string;
    otherExtraCosts: Prisma.Decimal | number | string;
    explicitUnitPrice?: Prisma.Decimal | null;
  }): Prisma.Decimal {
    if (
      input.explicitUnitPrice !== undefined &&
      input.explicitUnitPrice !== null
    ) {
      return input.explicitUnitPrice;
    }
    return calcQuoteItemUnitPriceDecimal({
      productPrice: input.productPrice,
      engravingPrice: input.engravingPrice,
      commissionPercent: input.commissionPercent,
      marginReservePercent: input.marginReservePercent,
      salesMarginPercent: input.salesMarginPercent,
      quantity: input.quantity,
      difalValue: input.difalValue,
      otherExtraCosts: input.otherExtraCosts,
    });
  }

  private resolveItemLineTotal(input: {
    productPrice: Prisma.Decimal;
    engravingPrice: Prisma.Decimal | null;
    commissionPercent: Prisma.Decimal | number | string;
    marginReservePercent: Prisma.Decimal | number | string;
    salesMarginPercent: Prisma.Decimal | number | string;
    quantity: number;
    difalValue: Prisma.Decimal | number | string;
    otherExtraCosts: Prisma.Decimal | number | string;
    explicitUnitPrice?: Prisma.Decimal | null;
  }): { unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal } {
    const unitPrecise = this.resolveItemUnitPrice(input);
    // Brinde.me: arredonda unitário (2 casas) e só então multiplica pela qtd.
    const unitPrice = roundMoneyDecimal(unitPrecise, 2);
    const qty =
      input.quantity > 0 ? new Prisma.Decimal(input.quantity) : new Prisma.Decimal(1);
    const lineTotal = unitPrice.mul(qty);
    return { unitPrice, lineTotal };
  }

  private async recalcItemUnitPrices(
    tx: Prisma.TransactionClient,
    quoteId: string,
    previousRates?: {
      commissionPercent: number;
      marginReservePercent: number;
      salesMarginPercent: number;
    },
  ): Promise<void> {
    const quote = await tx.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: {
        commissionPercent: true,
        marginReservePercent: true,
        salesMarginPercent: true,
        difalValue: true,
        otherExtraCosts: true,
        items: true,
      },
    });
    const commission = toDecimal(quote.commissionPercent, 2);
    const reserve = toDecimal(quote.marginReservePercent, 6);
    const sales = toDecimal(
      quote.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(quote.difalValue);
    const otherExtras = toDecimal(quote.otherExtraCosts);
    const prevCommission = toDecimal(
      previousRates?.commissionPercent ?? commission,
      2,
    );
    const prevReserve = toDecimal(
      previousRates?.marginReservePercent ?? reserve,
      6,
    );

    for (const item of quote.items) {
      const eng = toDecimal(item.engravingPrice);
      const qty = item.quantity > 0 ? item.quantity : 1;
      const prevSales = toDecimal(
        previousRates?.salesMarginPercent ?? sales,
        DEFAULT_SALES_MARGIN_PERCENT,
      );
      const prevFactor = quotePricingFactor(
        prevCommission,
        prevReserve,
        prevSales,
      );
      const extrasPerUnit = difal.add(otherExtras).div(qty);
      let productPrice = item.productPrice;

      if (productPrice == null) {
        const rawUnit = toDecimal(item.unitPrice);
        const base = prevFactor.greaterThan(0)
          ? rawUnit.div(prevFactor)
          : rawUnit;
        const inferred = base.sub(eng).sub(extrasPerUnit);
        productPrice = roundMoneyDecimal(
          inferred.lessThan(0) ? new Prisma.Decimal(0) : inferred,
          2,
        );
      }

      const { unitPrice, lineTotal } = this.resolveItemLineTotal({
        productPrice,
        engravingPrice: item.engravingPrice,
        commissionPercent: commission,
        marginReservePercent: reserve,
        salesMarginPercent: sales,
        quantity: qty,
        difalValue: difal,
        otherExtraCosts: otherExtras,
      });

      await tx.quoteItem.update({
        where: { id: item.id },
        data: {
          ...(item.productPrice == null ? { productPrice } : {}),
          unitPrice,
          total: lineTotal,
        },
      });
    }
  }

  private async loadQuoteSerialized(
    id: string,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const row = await this.prisma.client.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' } },
        proposals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!row) throw new NotFoundException('Orçamento não encontrado.');
    return this.serialize(row, viewer);
  }

  async addItem(
    quoteId: string,
    dto: CreateQuoteItemDto,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        commissionPercent: true,
        marginReservePercent: true,
        salesMarginPercent: true,
        difalValue: true,
        otherExtraCosts: true,
      },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');

    const commission = toDecimal(quote.commissionPercent, 2);
    const reserve = toDecimal(quote.marginReservePercent, 6);
    const sales = toDecimal(
      quote.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(quote.difalValue);
    const otherExtras = toDecimal(quote.otherExtraCosts);
    let sku = dto.sku?.trim() || '';
    let description = dto.description?.trim() || '';
    let imageUrl = dto.imageUrl?.trim() || null;
    let supplier = dto.supplier?.trim() || null;
    let productPrice =
      dto.productPrice !== undefined && dto.productPrice !== null
        ? new Prisma.Decimal(dto.productPrice)
        : null;

    if (dto.catalogProductId) {
      const catalog = await this.prisma.client.quoteCatalogProduct.findUnique({
        where: { id: dto.catalogProductId },
      });
      if (!catalog) {
        throw new NotFoundException('Produto do catálogo não encontrado.');
      }
      sku = sku || catalog.supplierCode;
      description = description || catalog.name;
      imageUrl = imageUrl ?? catalog.imageUrl;
      supplier = supplier || catalog.supplier || null;
      if (productPrice === null) productPrice = catalog.salePrice;
    }

    if (!sku) {
      throw new BadRequestException('Informe o SKU ou um produto do catálogo.');
    }
    if (!description) description = sku;
    if (productPrice === null) {
      productPrice =
        dto.unitPrice !== undefined && dto.unitPrice !== null
          ? new Prisma.Decimal(dto.unitPrice)
          : new Prisma.Decimal(0);
    }

    const quantity = dto.quantity;
    let engravingTechniqueId = dto.engravingTechniqueId?.trim() || null;
    let engraving = dto.engraving?.trim() || null;
    let engravingPrice: Prisma.Decimal | null =
      dto.engravingPrice !== undefined && dto.engravingPrice !== null
        ? new Prisma.Decimal(dto.engravingPrice)
        : null;

    if (engravingTechniqueId) {
      const technique = await this.prisma.client.engravingTechnique.findUnique({
        where: { id: engravingTechniqueId },
        include: { tiers: { orderBy: { qtyFrom: 'asc' } } },
      });
      if (!technique) {
        throw new BadRequestException('Técnica de gravação não encontrada.');
      }
      engraving = engraving || technique.name;
      if (engravingPrice === null) {
        const calc = calcEngravingUnitPrice(technique.tiers, quantity);
        engravingPrice =
          calc === null ? null : new Prisma.Decimal(roundMoney(calc, 4));
      }
    } else if (dto.engravingTechniqueId === null) {
      engravingTechniqueId = null;
    }

    const { unitPrice, lineTotal } = this.resolveItemLineTotal({
      productPrice,
      engravingPrice,
      commissionPercent: commission,
      marginReservePercent: reserve,
      salesMarginPercent: sales,
      quantity,
      difalValue: difal,
      otherExtraCosts: otherExtras,
      explicitUnitPrice:
        dto.unitPrice !== undefined && dto.unitPrice !== null
          ? new Prisma.Decimal(dto.unitPrice)
          : null,
    });

    const requiresArtwork =
      dto.requiresArtwork ??
      (supplier === 'SPOT' && Boolean(engraving || engravingTechniqueId));

    await this.prisma.client.$transaction(async (tx) => {
      const maxOrder = await tx.quoteItem.aggregate({
        where: { quoteId },
        _max: { order: true },
      });
      await tx.quoteItem.create({
        data: {
          quoteId,
          sku,
          description,
          imageUrl,
          engraving,
          engravingTechniqueId,
          engravingPrice,
          productPrice,
          supplier,
          requiresArtwork,
          artworkFileName: dto.artworkFileName?.trim() || null,
          artworkMimeType: dto.artworkMimeType?.trim() || null,
          artworkData: dto.artworkData?.trim() || null,
          quantity,
          unitPrice,
          total: lineTotal,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      await this.recalcTotals(tx, quoteId);
    });

    return this.loadQuoteSerialized(quoteId, viewer);
  }

  async updateItem(
    quoteId: string,
    itemId: string,
    dto: UpdateQuoteItemDto,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const item = await this.prisma.client.quoteItem.findFirst({
      where: { id: itemId, quoteId },
    });
    if (!item) throw new NotFoundException('Item do orçamento não encontrado.');

    const quote = await this.prisma.client.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: {
        commissionPercent: true,
        marginReservePercent: true,
        salesMarginPercent: true,
        difalValue: true,
        otherExtraCosts: true,
      },
    });
    const commission = toDecimal(quote.commissionPercent, 2);
    const reserve = toDecimal(quote.marginReservePercent, 6);
    const sales = toDecimal(
      quote.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(quote.difalValue);
    const otherExtras = toDecimal(quote.otherExtraCosts);

    const quantity = dto.quantity ?? item.quantity;
    let productPrice =
      dto.productPrice !== undefined
        ? dto.productPrice === null
          ? null
          : new Prisma.Decimal(dto.productPrice)
        : item.productPrice;
    if (productPrice === null) {
      productPrice = item.unitPrice;
    }

    let engravingTechniqueId =
      dto.engravingTechniqueId !== undefined
        ? dto.engravingTechniqueId?.trim() || null
        : item.engravingTechniqueId;
    let engraving =
      dto.engraving !== undefined
        ? dto.engraving?.trim() || null
        : item.engraving;
    let engravingPrice =
      dto.engravingPrice !== undefined
        ? dto.engravingPrice === null
          ? null
          : new Prisma.Decimal(dto.engravingPrice)
        : item.engravingPrice;

    const techniqueChanging =
      dto.engravingTechniqueId !== undefined ||
      (dto.quantity !== undefined && Boolean(engravingTechniqueId));
    const shouldRecalcEngraving =
      techniqueChanging &&
      dto.engravingPrice === undefined &&
      engravingTechniqueId;

    if (shouldRecalcEngraving && engravingTechniqueId) {
      const technique = await this.prisma.client.engravingTechnique.findUnique({
        where: { id: engravingTechniqueId },
        include: { tiers: { orderBy: { qtyFrom: 'asc' } } },
      });
      if (!technique) {
        throw new BadRequestException('Técnica de gravação não encontrada.');
      }
      if (dto.engravingTechniqueId !== undefined) {
        engraving = technique.name;
      }
      const calc = calcEngravingUnitPrice(technique.tiers, quantity);
      engravingPrice =
        calc === null ? null : new Prisma.Decimal(roundMoney(calc, 4));
    }

    if (dto.engravingTechniqueId === null) {
      engravingTechniqueId = null;
      if (dto.engraving === undefined) engraving = null;
      if (dto.engravingPrice === undefined) engravingPrice = null;
    }

    const shouldRecalcUnit =
      dto.unitPrice === undefined &&
      (dto.productPrice !== undefined ||
        dto.engravingPrice !== undefined ||
        shouldRecalcEngraving ||
        dto.engravingTechniqueId !== undefined ||
        dto.quantity !== undefined);

    const priced =
      dto.unitPrice !== undefined && dto.unitPrice !== null
        ? (() => {
            const unitPrice = roundMoneyDecimal(dto.unitPrice, 2);
            return {
              unitPrice,
              lineTotal: unitPrice.mul(quantity),
            };
          })()
        : shouldRecalcUnit
          ? this.resolveItemLineTotal({
              productPrice,
              engravingPrice,
              commissionPercent: commission,
              marginReservePercent: reserve,
              salesMarginPercent: sales,
              quantity,
              difalValue: difal,
              otherExtraCosts: otherExtras,
            })
          : (() => {
              const unitPrice = roundMoneyDecimal(item.unitPrice, 2);
              return {
                unitPrice,
                lineTotal: unitPrice.mul(quantity),
              };
            })();
    const { unitPrice, lineTotal } = priced;

    const nextSupplier =
      dto.supplier !== undefined
        ? dto.supplier?.trim() || null
        : item.supplier;
    const nextRequiresArtwork =
      dto.requiresArtwork !== undefined
        ? dto.requiresArtwork
        : nextSupplier === 'SPOT' &&
          Boolean(engraving || engravingTechniqueId);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.quoteItem.update({
        where: { id: itemId },
        data: {
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || item.description }
            : {}),
          engraving,
          engravingTechniqueId,
          engravingPrice,
          productPrice,
          ...(dto.supplier !== undefined ? { supplier: nextSupplier } : {}),
          requiresArtwork: nextRequiresArtwork,
          ...(dto.artworkFileName !== undefined
            ? { artworkFileName: dto.artworkFileName?.trim() || null }
            : {}),
          ...(dto.artworkMimeType !== undefined
            ? { artworkMimeType: dto.artworkMimeType?.trim() || null }
            : {}),
          ...(dto.artworkData !== undefined
            ? { artworkData: dto.artworkData?.trim() || null }
            : {}),
          ...(!nextRequiresArtwork &&
          (dto.engraving !== undefined ||
            dto.engravingTechniqueId !== undefined)
            ? {
                artworkFileName: null,
                artworkMimeType: null,
                artworkData: null,
              }
            : {}),
          quantity,
          unitPrice,
          total: lineTotal,
        },
      });
      await this.recalcTotals(tx, quoteId);
    });

    return this.loadQuoteSerialized(quoteId, viewer);
  }

  async removeItem(
    quoteId: string,
    itemId: string,
    viewer?: { id?: string; email?: string; name?: string } | null,
  ) {
    const item = await this.prisma.client.quoteItem.findFirst({
      where: { id: itemId, quoteId },
      select: { id: true },
    });
    if (!item) throw new NotFoundException('Item do orçamento não encontrado.');

    await this.prisma.client.$transaction(async (tx) => {
      await tx.quoteItem.delete({ where: { id: itemId } });
      await this.recalcTotals(tx, quoteId);
    });

    return this.loadQuoteSerialized(quoteId, viewer);
  }

  private normalizeQuoteSearch(search: string): {
    raw: string;
    codeHint: string | null;
  } {
    const raw = search.trim();
    const withoutLabel = raw
      .replace(/^(or[cç]amento|orc)\s*/i, '')
      .trim();
    const digits = withoutLabel.replace(/^ORC-?/i, '').replace(/\D/g, '');
    if (digits.length > 0 && digits.length <= 8) {
      return {
        raw: withoutLabel || raw,
        codeHint: `ORC-${digits.padStart(2, '0')}`,
      };
    }
    if (/^ORC-/i.test(withoutLabel)) {
      return { raw: withoutLabel, codeHint: withoutLabel.toUpperCase() };
    }
    return { raw, codeHint: null };
  }

  private async resolvePurchaseRequesterId(
    preferredUserId?: string | null,
  ): Promise<string | null> {
    if (preferredUserId?.trim()) {
      const preferred = await this.prisma.client.user.findUnique({
        where: { id: preferredUserId.trim() },
        select: { id: true },
      });
      if (preferred) return preferred.id;
    }
    const fallback = await this.prisma.client.user.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return fallback?.id ?? null;
  }

  private async createPurchaseRequestFromApprovedQuote(
    quote: {
      id: string;
      code: string;
      customerName: string;
      responsibleUserId?: string | null;
      deliveryAddress?: string | null;
      items?: Array<{
        id?: string;
        sku: string;
        description: string;
        quantity: number;
        engraving: string | null;
        supplier: string | null;
        productPrice?: Prisma.Decimal | number | string | null;
        engravingPrice?: Prisma.Decimal | number | string | null;
      }>;
    },
    actorUserId?: string | null,
  ) {
    const existing = await this.prisma.client.purchaseRequest.findFirst({
      where: { quoteId: quote.id },
      select: { id: true },
    });
    if (existing) return;

    const items = quote.items ?? [];
    const requestedById = await this.resolvePurchaseRequesterId(
      actorUserId || quote.responsibleUserId || null,
    );
    if (!requestedById) {
      this.logger.error(
        `Orçamento ${quote.code} aprovado sem usuário para criar PurchaseRequest.`,
      );
      return;
    }

    const customerName = quote.customerName.trim() || null;
    const deliveryAddress = quote.deliveryAddress?.trim() || null;
    const common = {
      type: 'VENDA_EXTERNA' as const,
      status: 'SOLICITADO',
      priority: 'NORMAL',
      customerName,
      saleOrderRef: quote.code,
      quoteId: quote.id,
      deliveryAddress,
      requestedById,
    };

    if (items.length === 0) {
      await this.prisma.client.purchaseRequest.create({
        data: {
          ...common,
          itemName: `Orçamento ${quote.code}`,
          quantity: 1,
        },
      });
      return;
    }

    // Um card por item do orçamento, com SKU, preços, fornecedor e vínculo ao QuoteItem
    await this.prisma.client.purchaseRequest.createMany({
      data: items.map((item) => {
        const qty = Math.max(1, item.quantity || 1);
        const productUnit = toDecimal(item.productPrice, 0);
        const engravingUnit = toDecimal(item.engravingPrice, 0);
        const lineCost = productUnit.add(engravingUnit).mul(qty);
        const supplier =
          item.supplier?.trim() === 'SPOT' || item.supplier?.trim() === 'XBZ'
            ? item.supplier.trim()
            : item.supplier?.trim() || null;
        return {
          ...common,
          quoteItemId: item.id?.trim() || null,
          sku: item.sku?.trim() || null,
          itemName: (item.description?.trim() || item.sku || 'Item').slice(
            0,
            300,
          ),
          quantity: qty,
          itemPrice: productUnit,
          engravingPrice: engravingUnit.greaterThan(0) ? engravingUnit : null,
          supplierName: supplier,
          purchaseValue: lineCost,
        };
      }),
    });
  }

  private async handleStatusSideEffects(
    quote: {
      id: string;
      code: string;
      status: string;
      linkedCrmCardId: string | null;
      total: Prisma.Decimal;
      customerName: string;
      deliveryAddress?: string | null;
      responsibleUserId?: string | null;
      items?: Array<{
        id?: string;
        sku: string;
        description: string;
        quantity: number;
        engraving: string | null;
        supplier: string | null;
        productPrice?: Prisma.Decimal | number | string | null;
        engravingPrice?: Prisma.Decimal | number | string | null;
      }>;
    },
    previousStatus: string,
    actorUserId?: string | null,
  ) {
    if (quote.status === previousStatus) return;

    if (quote.status === 'PENDENTE_APROVACAO') {
      try {
        await this.notifications.notifyRouted({
          type: NOTIFICATION_TYPES.QUOTE_PENDING_APPROVAL,
          title: `Orçamento ${quote.code} pendente de aprovação`,
          body: `${quote.customerName} · ${quote.total.toString()}`,
          link: `/app/crm?quote=${quote.id}`,
          entityId: quote.id,
          entityType: 'Quote',
          label: quote.code,
          priority: NOTIFICATION_PRIORITY.HIGH,
          skipBusinessHours: true,
        });
      } catch (err) {
        this.logger.error(
          `Falha ao notificar aprovação do orçamento ${quote.code}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (quote.status === 'APROVADO') {
      try {
        await this.createPurchaseRequestFromApprovedQuote(quote, actorUserId);
      } catch (err) {
        this.logger.error(
          `Falha ao criar requisição de compra do orçamento ${quote.code}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      if (quote.linkedCrmCardId) {
        try {
          await this.crm.markCardStatusByName(quote.linkedCrmCardId, 'Fechado');
        } catch (err) {
          this.logger.error(
            `Falha ao fechar lead CRM do orçamento ${quote.code}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
  }

  private periodDateFrom(period: QuoteDashboardPeriod | undefined): Date | null {
    const p = period ?? '30d';
    if (p === 'all') return null;
    const days = p === '7d' ? 7 : p === '90d' ? 90 : 30;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days);
    return from;
  }

  async searchPeople(q?: string) {
    const search = q?.trim() ?? '';
    const take = search ? 40 : 30;

    const customerWhere = search
      ? {
          isActive: true,
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { document: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : { isActive: true };

    const cardWhere = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [customers, cards] = await Promise.all([
      this.prisma.client.customer.findMany({
        where: customerWhere,
        orderBy: { name: 'asc' },
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          document: true,
          deliveryAddress: true,
        },
      }),
      this.prisma.client.crmCard.findMany({
        where: cardWhere,
        orderBy: { name: 'asc' },
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      }),
    ]);

    const fromCadastro = customers.map((row) => ({
      id: row.id,
      source: 'CADASTRO' as const,
      name: row.name,
      email: row.email,
      phone: row.phone,
      document: row.document,
      deliveryAddress: row.deliveryAddress,
      customerId: row.id,
      linkedCrmCardId: null as string | null,
    }));

    const fromCrm = cards.map((row) => ({
      id: row.id,
      source: 'CRM' as const,
      name: row.name,
      email: row.email,
      phone: row.phone,
      document: null as string | null,
      deliveryAddress: null as string | null,
      customerId: null as string | null,
      linkedCrmCardId: row.id,
    }));

    return [...fromCadastro, ...fromCrm]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, 60);
  }

  async getDashboard(period?: QuoteDashboardPeriod) {
    const dateFrom = this.periodDateFrom(period);
    const where: Prisma.QuoteWhereInput = dateFrom
      ? { requestDate: { gte: dateFrom } }
      : {};

    const rows = await this.prisma.client.quote.findMany({
      where,
      select: {
        id: true,
        status: true,
        total: true,
        responsibleUserId: true,
      },
    });

    const totalQuotes = rows.length;
    const aprovados = rows.filter((r) => r.status === 'APROVADO');
    const abertos = rows.filter(
      (r) =>
        r.status === 'AGUARDANDO' || r.status === 'PENDENTE_APROVACAO',
    );
    const valorAberto = abertos.reduce(
      (acc, r) => acc + Number(r.total),
      0,
    );
    const valorTotal = rows.reduce((acc, r) => acc + Number(r.total), 0);
    const ticketMedio = totalQuotes > 0 ? valorTotal / totalQuotes : 0;
    const taxaConversao =
      totalQuotes > 0 ? (aprovados.length / totalQuotes) * 100 : 0;

    const userIds = [
      ...new Set(
        rows
          .map((r) => r.responsibleUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const users = userIds.length
      ? await this.prisma.client.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

    const bySellerMap = new Map<
      string,
      { responsavelId: string | null; nome: string; quantidade: number; valorTotal: number; aprovados: number }
    >();

    for (const row of rows) {
      const key = row.responsibleUserId ?? '__none__';
      const current = bySellerMap.get(key) ?? {
        responsavelId: row.responsibleUserId,
        nome: row.responsibleUserId
          ? userNameById[row.responsibleUserId] ?? 'Responsável'
          : 'Sem responsável',
        quantidade: 0,
        valorTotal: 0,
        aprovados: 0,
      };
      current.quantidade += 1;
      current.valorTotal += Number(row.total);
      if (row.status === 'APROVADO') current.aprovados += 1;
      bySellerMap.set(key, current);
    }

    const porVendedor = [...bySellerMap.values()]
      .map((row) => ({
        responsavelId: row.responsavelId,
        nome: row.nome,
        quantidade: row.quantidade,
        valorTotal: Number(row.valorTotal.toFixed(2)),
        taxaConversao:
          row.quantidade > 0
            ? Number(((row.aprovados / row.quantidade) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal);

    return {
      period: period ?? '30d',
      resumo: {
        valorAberto: Number(valorAberto.toFixed(2)),
        ticketMedio: Number(ticketMedio.toFixed(2)),
        taxaConversao: Number(taxaConversao.toFixed(1)),
        totalOrcamentos: totalQuotes,
        aprovados: aprovados.length,
      },
      porVendedor,
    };
  }

  private async nextOrderCode(tx: Prisma.TransactionClient): Promise<string> {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${NEXT_ORDER_CODE_LOCK})`,
    );
    const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
      SELECT (COALESCE(MAX(CAST(SPLIT_PART("code", '-', 2) AS INTEGER)), 0) + 1)::bigint AS next
      FROM "Order"
      WHERE "code" ~ '^PED-[0-9]+$'
    `;
    const n = Number(rows[0]?.next ?? 1);
    return `PED-${String(n).padStart(6, '0')}`;
  }

  async convertToOrder(quoteId: string, actorUserId: string) {
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    if (quote.linkedOrderId) {
      throw new BadRequestException(
        'Este orçamento já foi convertido em pedido.',
      );
    }
    if (quote.items.length === 0) {
      throw new BadRequestException(
        'Inclua ao menos um produto antes de enviar o pedido.',
      );
    }

    const result = await this.prisma.client.$transaction(async (tx) => {
      const code = await this.nextOrderCode(tx);
      let subtotalDec = new Prisma.Decimal(0);
      let lineNumber = 10;
      const creates: Prisma.OrderItemCreateWithoutOrderInput[] = [];

      for (const item of quote.items) {
        const unitPrice = item.unitPrice;
        const totalLine = item.total;
        subtotalDec = subtotalDec.add(totalLine);
        creates.push({
          lineNumber,
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          reservedQuantity: 0,
          unitPrice,
          totalPrice: totalLine,
          discount: new Prisma.Decimal(0),
        });
        lineNumber += 10;
      }

      const freight =
        quote.freightToConsult || !quote.freightValue
          ? new Prisma.Decimal(0)
          : quote.freightValue;
      // Difal/extras já embutidos nos unitPrice dos itens
      const totalFixed = subtotalDec.add(freight).toDecimalPlaces(2);

      const order = await tx.order.create({
        data: {
          source: OrderSource.MANUAL,
          code,
          externalOrderNumber: quote.customerOrderRef || quote.code,
          customerId: quote.customerId || null,
          customerName: quote.customerName,
          customerDocument: quote.customerDocument,
          deliveryAddress: quote.deliveryAddress,
          carrierId: quote.carrierId || null,
          notes: `Convertido do orçamento ${quote.code}`,
          status: OrderStatus.NOVO,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          priority: 3,
          orderDate: new Date(),
          subtotal: subtotalDec.toDecimalPlaces(2),
          discount: new Prisma.Decimal(0),
          total: totalFixed,
          totalValue: totalFixed,
          items: { create: creates },
        },
        select: { id: true, code: true },
      });

      const updatedQuote = await tx.quote.update({
        where: { id: quoteId },
        data: {
          linkedOrderId: order.id,
          status: 'APROVADO',
        },
        include: {
          items: { orderBy: { order: 'asc' } },
          proposals: { orderBy: { createdAt: 'desc' } },
        },
      });

      return { order, quote: updatedQuote, previousStatus: quote.status };
    });

    if (result.quote.status !== result.previousStatus) {
      await this.handleStatusSideEffects(
        result.quote,
        result.previousStatus,
        actorUserId,
      );
    }

    return {
      quote: this.serialize(result.quote),
      order: {
        id: result.order.id,
        code: result.order.code,
      },
    };
  }
}
