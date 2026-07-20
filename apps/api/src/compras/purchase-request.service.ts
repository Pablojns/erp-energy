import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from '../notifications/notification.constants';
import { R2StorageService } from '../storage/r2-storage.service';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestType,
} from './dto/create-purchase-request.dto';
import type { ListPurchaseRequestsQueryDto } from './dto/list-purchase-requests-query.dto';
import type { ResolvePurchaseRequestDto } from './dto/resolve-purchase-request.dto';
import {
  calcQuoteItemUnitPriceDecimal,
  DEFAULT_SALES_MARGIN_PERCENT,
  roundMoneyDecimal,
  toDecimal,
} from '../quotes/quote-pricing.util';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_SIGNED_URL_TTL = 3600;

const PURCHASE_REQUEST_INCLUDE = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      internalCode: true,
      stockQty: true,
      minStock: true,
      cost: true,
      supplierSku: true,
      supplier: { select: { id: true, name: true } },
    },
  },
  quoteItem: {
    select: {
      id: true,
      imageUrl: true,
      engraving: true,
    },
  },
  images: {
    select: { id: true, imageKey: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  requestedBy: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true, email: true } },
} as const;

type PurchaseRequestRow = Prisma.PurchaseRequestGetPayload<{
  include: typeof PURCHASE_REQUEST_INCLUDE;
}>;

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async criar(
    userId: string,
    dto: CreatePurchaseRequestDto,
    files?: Express.Multer.File[],
    force = false,
  ) {
    const common = this.buildCommonFields(userId, dto);

    if (dto.type === PurchaseRequestType.WEG_CONTRATO) {
      if (!dto.productId?.trim()) {
        throw new BadRequestException('Informe o produto para solicitação WEG.');
      }

      const product = await this.prisma.client.product.findUnique({
        where: { id: dto.productId.trim() },
        select: {
          id: true,
          name: true,
          sku: true,
          supplierSku: true,
          minStock: true,
          stockQty: true,
          supplier: { select: { name: true } },
        },
      });
      if (!product) {
        throw new NotFoundException('Produto não encontrado.');
      }

      if (!force) {
        const existing = await this.prisma.client.purchaseRequest.findFirst({
          where: {
            type: PurchaseRequestType.WEG_CONTRATO,
            status: 'SOLICITADO',
            productId: product.id,
          },
          select: {
            id: true,
            suggestedQty: true,
            product: { select: { name: true } },
          },
        });
        if (existing) {
          throw new HttpException(
            {
              duplicate: true,
              existingId: existing.id,
              currentQty: existing.suggestedQty ?? 0,
              itemName: existing.product?.name?.trim() || product.name.trim(),
            },
            HttpStatus.CONFLICT,
          );
        }
      }

      const imageKeys = await this.uploadImages(files ?? []);

      const gap = product.minStock - product.stockQty;
      const suggestedQty = Math.max(1, dto.suggestedQty ?? gap);
      const supplierName = await this.resolveSupplierName(
        product.name,
        product.sku,
        product.supplier?.name,
        dto.supplierName,
      );
      const supplierSku =
        dto.sku?.trim() || product.supplierSku?.trim() || null;

      await this.syncWegProductBaseCost(product.id, dto.itemPrice);

      const created = await this.prisma.client.purchaseRequest.create({
        data: {
          ...common,
          type: dto.type,
          productId: product.id,
          suggestedQty,
          supplierName,
          sku: supplierSku,
          images: {
            create: imageKeys.map((imageKey) => ({ imageKey })),
          },
        },
        include: PURCHASE_REQUEST_INCLUDE,
      });

      this.notifyCompraCriada(created);

      return this.serialize(created);
    }

    const sku = dto.sku?.trim();
    const itemName = dto.itemName?.trim();
    const quantity = dto.quantity;

    if (!itemName || quantity == null || quantity < 1) {
      throw new BadRequestException(
        'Informe nome do item e quantidade (mínimo 1).',
      );
    }

    if (
      !force &&
      (dto.type === PurchaseRequestType.VENDA_EXTERNA ||
        dto.type === PurchaseRequestType.MARKETPLACE)
    ) {
      const existing = await this.prisma.client.purchaseRequest.findFirst({
        where: {
          type: dto.type,
          status: 'SOLICITADO',
          itemName: { equals: itemName, mode: Prisma.QueryMode.insensitive },
        },
        select: {
          id: true,
          quantity: true,
          itemName: true,
        },
      });
      if (existing) {
        throw new HttpException(
          {
            duplicate: true,
            existingId: existing.id,
            currentQty: existing.quantity ?? 0,
            itemName: existing.itemName?.trim() || itemName,
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    const imageKeys = await this.uploadImages(files ?? []);

    const created = await this.prisma.client.purchaseRequest.create({
      data: {
        ...common,
        type: dto.type,
        sku: sku || null,
        itemName,
        quantity,
        clientDeadline: dto.clientDeadline
          ? new Date(dto.clientDeadline)
          : null,
        link: dto.link?.trim() || null,
        images: {
          create: imageKeys.map((imageKey) => ({ imageKey })),
        },
      },
      include: PURCHASE_REQUEST_INCLUDE,
    });

    this.notifyCompraCriada(created);

    return this.serialize(created);
  }

  async listar(query: ListPurchaseRequestsQueryDto) {
    const page = query.page != null && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize != null && query.pageSize > 0 && query.pageSize <= 100
        ? query.pageSize
        : 15;

    const where: Prisma.PurchaseRequestWhereInput = {};

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { itemName: { contains: search, mode: Prisma.QueryMode.insensitive } },
        { sku: { contains: search, mode: Prisma.QueryMode.insensitive } },
        {
          product: {
            name: { contains: search, mode: Prisma.QueryMode.insensitive },
          },
        },
        {
          requestedBy: {
            name: { contains: search, mode: Prisma.QueryMode.insensitive },
          },
        },
      ];
    }

    const startDate = query.startDate?.trim();
    const endDate = query.endDate?.trim();
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      }
      if (endDate) {
        where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
      }
    }

    const total = await this.prisma.client.purchaseRequest.count({ where });
    const rows = await this.prisma.client.purchaseRequest.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: PURCHASE_REQUEST_INCLUDE,
    });

    return {
      data: await Promise.all(rows.map((row) => this.serialize(row))),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async buscarPorId(id: string) {
    const row = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      include: PURCHASE_REQUEST_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    return this.serialize(row, true);
  }

  async marcarComprado(
    id: string,
    userId: string,
    dto: ResolvePurchaseRequestDto,
  ) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status !== 'SOLICITADO') {
      throw new BadRequestException(
        'Apenas solicitações pendentes podem ser marcadas como compradas.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data: {
        status: 'COMPRADO',
        resolvedById: userId,
        resolvedAt: now,
        purchasedAt: now,
        purchaseValue:
          dto.purchaseValue != null
            ? new Prisma.Decimal(dto.purchaseValue)
            : null,
        refusalReason: null,
      },
      include: PURCHASE_REQUEST_INCLUDE,
    });

    return this.serialize(updated, true);
  }

  async recusar(id: string, userId: string, dto: ResolvePurchaseRequestDto) {
    const refusalReason = dto.refusalReason?.trim();
    if (!refusalReason) {
      throw new BadRequestException('Informe o motivo da recusa.');
    }

    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status !== 'SOLICITADO') {
      throw new BadRequestException(
        'Apenas solicitações pendentes podem ser recusadas.',
      );
    }

    const now = new Date();
    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data: {
        status: 'RECUSADO',
        resolvedById: userId,
        resolvedAt: now,
        refusalReason,
        purchasedAt: null,
        purchaseValue: null,
      },
      include: PURCHASE_REQUEST_INCLUDE,
    });

    return this.serialize(updated, true);
  }

  async atualizarStatus(id: string, status: string, userId: string) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status === 'RECUSADO') {
      throw new BadRequestException(
        'Solicitações recusadas não podem ser movidas no fluxo.',
      );
    }

    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data: { status },
      include: PURCHASE_REQUEST_INCLUDE,
    });

    const itemLabel = this.itemDisplayName(updated);
    const comprasAction = this.comprasNotificationAction(updated.type);
    if (existing.status !== status && status === 'PEDIDO_ENVIADO_APROVADO') {
      void this.notifications.createForPermissionExcluding(
        'notificacoes',
        comprasAction,
        'Pedido enviado ao fornecedor',
        `${itemLabel} foi enviado/aprovado`,
        'compra_enviada',
        '/app/compras',
        userId,
      );
    }
    if (existing.status !== status && status === 'PEDIDO_PAGO') {
      void this.notifications.createForPermissionExcluding(
        'notificacoes',
        comprasAction,
        'Pedido pago',
        `${itemLabel} foi pago`,
        'compra_paga',
        '/app/compras',
        userId,
      );
    }
    if (existing.status !== status && status === 'LAYOUT_APROVADO') {
      void this.notifications.createForPermissionExcluding(
        'notificacoes',
        comprasAction,
        'Layout aprovado',
        `${itemLabel} teve layout aprovado — produção pode iniciar`,
        'compra_layout_aprovado',
        '/app/compras',
        userId,
      );
    }
    if (existing.status !== status && status === 'EXPEDIDO') {
      void this.notifications.createForPermission(
        'notificacoes',
        comprasAction,
        'Item expedido pelo fornecedor',
        `${itemLabel} foi expedido — solicite coleta`,
        'compra_expedida',
        '/app/compras',
      );
    }
    if (existing.status !== status && status === 'RECEBIDO') {
      const itemLabel = this.itemDisplayName(updated);
      void this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.PURCHASE_RECEIVED,
        title: 'Item recebido',
        body: `${itemLabel} chegou — separe os pedidos pendentes`,
        link: '/app/compras',
        entityId: updated.id,
        entityType: 'purchase',
        label: itemLabel,
        priority: NOTIFICATION_PRIORITY.NORMAL,
      });
    }

    return this.serialize(updated, true);
  }

  async atualizarQuantidade(
    id: string,
    dto: {
      suggestedQty?: number;
      quantity?: number;
      engravingPrice?: number | null;
      itemPrice?: number | null;
      customerName?: string | null;
      priority?: 'NORMAL' | 'URGENTE';
      link?: string | null;
    },
  ) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        type: true,
        quoteItemId: true,
        quantity: true,
        itemPrice: true,
        engravingPrice: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status === 'COMPRADO' || existing.status === 'RECUSADO') {
      throw new BadRequestException(
        'Solicitações compradas ou recusadas não podem ser editadas.',
      );
    }

    const data: Prisma.PurchaseRequestUpdateInput = {};

    if (dto.suggestedQty != null) {
      if (existing.type !== PurchaseRequestType.WEG_CONTRATO) {
        throw new BadRequestException(
          'Quantidade sugerida só se aplica a solicitações WEG.',
        );
      }
      if (dto.suggestedQty < 1) {
        throw new BadRequestException('Informe a quantidade sugerida (mínimo 1).');
      }
      data.suggestedQty = dto.suggestedQty;
    }

    if (dto.quantity != null) {
      if (existing.type === PurchaseRequestType.WEG_CONTRATO) {
        throw new BadRequestException(
          'Use quantidade sugerida para solicitações WEG.',
        );
      }
      if (dto.quantity < 1) {
        throw new BadRequestException('Informe a quantidade (mínimo 1).');
      }
      data.quantity = dto.quantity;
    }

    if (dto.engravingPrice !== undefined) {
      data.engravingPrice =
        dto.engravingPrice == null
          ? null
          : new Prisma.Decimal(Number(dto.engravingPrice).toFixed(2));
    }

    if (dto.itemPrice !== undefined) {
      data.itemPrice =
        dto.itemPrice == null
          ? null
          : new Prisma.Decimal(Number(dto.itemPrice).toFixed(2));
    }

    if (dto.customerName !== undefined) {
      data.customerName =
        dto.customerName == null ? null : dto.customerName.trim() || null;
    }

    if (dto.priority !== undefined) {
      data.priority = dto.priority;
    }

    if (dto.link !== undefined) {
      data.link = dto.link == null ? null : dto.link.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    // Recalcula valor da linha (produto + gravação) × qtd
    const nextQty =
      dto.quantity ??
      existing.quantity ??
      1;
    const nextItemPrice =
      dto.itemPrice !== undefined
        ? dto.itemPrice
        : existing.itemPrice != null
          ? Number(existing.itemPrice)
          : 0;
    const nextEngraving =
      dto.engravingPrice !== undefined
        ? dto.engravingPrice ?? 0
        : existing.engravingPrice != null
          ? Number(existing.engravingPrice)
          : 0;
    if (
      dto.quantity != null ||
      dto.itemPrice !== undefined ||
      dto.engravingPrice !== undefined
    ) {
      const line =
        (Math.max(0, Number(nextItemPrice) || 0) +
          Math.max(0, Number(nextEngraving) || 0)) *
        Math.max(1, nextQty);
      data.purchaseValue = new Prisma.Decimal(line.toFixed(2));
    }

    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data,
      include: PURCHASE_REQUEST_INCLUDE,
    });

    if (
      existing.quoteItemId &&
      (dto.quantity != null || dto.itemPrice !== undefined)
    ) {
      await this.syncLinkedQuoteItem({
        quoteItemId: existing.quoteItemId,
        quantity: dto.quantity,
        productPrice: dto.itemPrice,
      });
    }

    return this.serialize(updated, true);
  }

  async adicionarImagens(id: string, files?: Express.Multer.File[]) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status === 'COMPRADO' || existing.status === 'RECUSADO') {
      throw new BadRequestException(
        'Solicitações compradas ou recusadas não podem ser editadas.',
      );
    }
    const incoming = files ?? [];
    if (incoming.length === 0) {
      throw new BadRequestException('Envie ao menos uma imagem.');
    }
    const imageKeys = await this.uploadImages(incoming);
    if (imageKeys.length === 0) {
      throw new BadRequestException(
        'Nenhuma imagem válida recebida. Verifique o formato (PNG/JPG/WEBP) e o tamanho (máx. 5MB).',
      );
    }
    // create (não createMany) garante ids e evita falhas silenciosas em lote
    for (const imageKey of imageKeys) {
      await this.prisma.client.purchaseRequestImage.create({
        data: {
          purchaseRequestId: id,
          imageKey,
        },
      });
    }
    const updated = await this.prisma.client.purchaseRequest.findUniqueOrThrow({
      where: { id },
      include: PURCHASE_REQUEST_INCLUDE,
    });
    return this.serialize(updated, true);
  }

  async removerImagem(id: string, imageId: string) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }
    if (existing.status === 'COMPRADO' || existing.status === 'RECUSADO') {
      throw new BadRequestException(
        'Solicitações compradas ou recusadas não podem ser editadas.',
      );
    }

    const image = await this.prisma.client.purchaseRequestImage.findFirst({
      where: { id: imageId, purchaseRequestId: id },
      select: { id: true, imageKey: true },
    });
    if (!image) {
      throw new NotFoundException('Imagem não encontrada para esta solicitação.');
    }

    await this.r2.delete(image.imageKey);
    await this.prisma.client.purchaseRequestImage.delete({
      where: { id: image.id },
    });

    const updated = await this.prisma.client.purchaseRequest.findUniqueOrThrow({
      where: { id },
      include: PURCHASE_REQUEST_INCLUDE,
    });
    return this.serialize(updated, true);
  }

  /** Propaga qty/preço do produto para o QuoteItem e recalcula totais do orçamento. */
  private async syncLinkedQuoteItem(input: {
    quoteItemId: string;
    quantity?: number;
    productPrice?: number | null;
  }) {
    const item = await this.prisma.client.quoteItem.findUnique({
      where: { id: input.quoteItemId },
      include: {
        quote: {
          select: {
            id: true,
            commissionPercent: true,
            marginReservePercent: true,
            salesMarginPercent: true,
            difalValue: true,
            otherExtraCosts: true,
            freightValue: true,
            freightToConsult: true,
          },
        },
      },
    });
    if (!item) return;

    const quantity = input.quantity ?? item.quantity;
    const productPrice =
      input.productPrice !== undefined && input.productPrice !== null
        ? new Prisma.Decimal(Number(input.productPrice).toFixed(2))
        : item.productPrice ?? item.unitPrice;

    const commission = toDecimal(item.quote.commissionPercent, 2);
    const reserve = toDecimal(item.quote.marginReservePercent, 6);
    const sales = toDecimal(
      item.quote.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(item.quote.difalValue);
    const otherExtras = toDecimal(item.quote.otherExtraCosts);

    const unitPrecise = calcQuoteItemUnitPriceDecimal({
      productPrice,
      engravingPrice: item.engravingPrice,
      commissionPercent: commission,
      marginReservePercent: reserve,
      salesMarginPercent: sales,
      quantity,
      difalValue: difal,
      otherExtraCosts: otherExtras,
    });
    const unitPrice = roundMoneyDecimal(unitPrecise, 2);
    const lineTotal = unitPrice.mul(quantity);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.quoteItem.update({
        where: { id: item.id },
        data: {
          quantity,
          productPrice,
          unitPrice,
          total: lineTotal,
        },
      });
      const items = await tx.quoteItem.findMany({
        where: { quoteId: item.quoteId },
        select: { total: true },
      });
      const subtotalPrecise = items.reduce(
        (acc, row) => acc.add(row.total),
        new Prisma.Decimal(0),
      );
      const freight = item.quote.freightToConsult
        ? new Prisma.Decimal(0)
        : toDecimal(item.quote.freightValue);
      const subtotal = roundMoneyDecimal(subtotalPrecise, 2);
      const total = roundMoneyDecimal(subtotal.add(freight), 2);
      await tx.quote.update({
        where: { id: item.quoteId },
        data: { subtotal, total },
      });
    });
  }

  async atualizarChegada(id: string, expectedArrival: string) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data: { expectedArrival: new Date(expectedArrival) },
      include: PURCHASE_REQUEST_INCLUDE,
    });

    return this.serialize(updated, true);
  }

  async buscarImagem(id: string, imageId: string) {
    const image = await this.prisma.client.purchaseRequestImage.findFirst({
      where: { id: imageId, purchaseRequestId: id },
      select: { imageKey: true },
    });
    if (!image) {
      throw new NotFoundException('Imagem não encontrada para esta solicitação.');
    }

    const object = await this.r2.getObjectBuffer(image.imageKey);
    const filename = image.imageKey.split('/').pop() ?? 'imagem';

    return {
      buffer: object.buffer,
      contentType: object.contentType,
      contentLength: object.buffer.length,
      filename,
    };
  }

  async deletar(id: string) {
    const row = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: {
        id: true,
        images: { select: { imageKey: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    await Promise.all(row.images.map((image) => this.r2.delete(image.imageKey)));

    await this.prisma.client.purchaseRequest.delete({ where: { id } });
    return { ok: true };
  }

  private itemDisplayName(row: PurchaseRequestRow): string {
    return row.itemName?.trim() || row.product?.name?.trim() || 'Item';
  }

  private comprasNotificationAction(type: string): string {
    return type === PurchaseRequestType.WEG_CONTRATO
      ? 'receber_compras_weg'
      : 'receber_compras';
  }

  private notifyCompraCriada(created: PurchaseRequestRow): void {
    const itemLabel = this.itemDisplayName(created);
    void this.notifications.createForPermissionExcluding(
      'notificacoes',
      this.comprasNotificationAction(created.type),
      'Nova solicitação de compra',
      `${created.requestedBy.name} solicitou: ${itemLabel}`,
      'compra_criada',
      '/app/compras',
      created.requestedById,
    );
  }

  private async syncWegProductBaseCost(productId: string, itemPrice?: number) {
    if (itemPrice == null || !Number.isFinite(itemPrice) || itemPrice < 0) {
      return;
    }
    await this.prisma.client.product.update({
      where: { id: productId },
      data: { cost: new Prisma.Decimal(Number(itemPrice).toFixed(2)) },
    });
  }

  private buildCommonFields(userId: string, dto: CreatePurchaseRequestDto) {
    return {
      priority: dto.priority ?? 'NORMAL',
      status: 'SOLICITADO',
      observation: dto.observation?.trim() || null,
      requestedById: userId,
      supplierName: dto.supplierName?.trim() || null,
      itemPrice:
        dto.itemPrice != null ? new Prisma.Decimal(dto.itemPrice) : null,
      engravingPrice:
        dto.engravingPrice != null
          ? new Prisma.Decimal(dto.engravingPrice)
          : null,
      saleOrderRef: dto.saleOrderRef?.trim() || null,
      customerName: dto.customerName?.trim() || null,
    };
  }

  private async fileToBuffer(
    file: Express.Multer.File,
  ): Promise<Buffer | null> {
    if (file.buffer?.length) {
      return file.buffer;
    }
    if (file.path) {
      const { readFile, unlink } = await import('fs/promises');
      try {
        const buf = await readFile(file.path);
        return buf.length ? buf : null;
      } finally {
        await unlink(file.path).catch(() => undefined);
      }
    }
    return null;
  }

  private async uploadImages(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    const keys: string[] = [];
    for (const file of files) {
      const buffer = await this.fileToBuffer(file);
      if (!buffer?.length) continue;
      this.assertImageFile({ ...file, size: buffer.length, buffer });
      const ext = this.extensionFromFile(file);
      const key = `compras/${randomUUID()}.${ext}`;
      await this.r2.upload(key, buffer, file.mimetype || 'application/octet-stream');
      keys.push(key);
    }
    return keys;
  }

  private assertImageFile(file: Express.Multer.File) {
    if (file.size > IMAGE_MAX_BYTES) {
      throw new BadRequestException('Cada imagem deve ter no máximo 5MB.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Envie apenas arquivos de imagem.');
    }
  }

  private async resolveSupplierName(
    productName: string,
    productSku: string,
    linkedSupplierName?: string | null,
    dtoSupplierName?: string | null,
  ): Promise<string | null> {
    const fromLink = linkedSupplierName?.trim();
    if (fromLink) return fromLink;

    const fromDto = dtoSupplierName?.trim();
    if (fromDto) return fromDto;

    const suppliers = await this.prisma.client.supplier.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const haystack = `${productName} ${productSku}`.toUpperCase();
    const sorted = [...suppliers].sort((a, b) => b.name.length - a.name.length);
    for (const supplier of sorted) {
      const name = supplier.name.trim();
      if (name.length >= 2 && haystack.includes(name.toUpperCase())) {
        return name;
      }
    }
    return null;
  }

  private extensionFromFile(file: Express.Multer.File): string {
    const fromMime = MIME_EXT[file.mimetype];
    if (fromMime) return fromMime;

    const fromName = file.originalname?.split('.').pop()?.toLowerCase();
    if (fromName && /^[a-z0-9]+$/.test(fromName)) {
      return fromName;
    }

    return 'jpg';
  }

  private async serialize(row: PurchaseRequestRow, withImageUrls = false) {
    const images = await Promise.all(
      row.images.map(async (image) => {
        let url: string | null = null;
        if (withImageUrls) {
          try {
            url = await this.r2.getSignedUrl(
              image.imageKey,
              IMAGE_SIGNED_URL_TTL,
            );
          } catch {
            url = null;
          }
        }
        return {
          id: image.id,
          imageKey: image.imageKey,
          url,
          createdAt: image.createdAt.toISOString(),
        };
      }),
    );

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      productId: row.productId,
      product: row.product,
      suggestedQty: row.suggestedQty,
      sku:
        row.type === 'WEG_CONTRATO'
          ? row.sku?.trim() || row.product?.supplierSku?.trim() || null
          : row.sku,
      itemName: row.itemName,
      quantity: row.quantity,
      customerName: row.customerName,
      clientDeadline: row.clientDeadline?.toISOString() ?? null,
      link: row.link,
      logoPlaceholder: row.logoPlaceholder,
      images,
      supplierName:
        row.supplierName?.trim() ||
        row.product?.supplier?.name?.trim() ||
        null,
      itemPrice: row.itemPrice?.toString() ?? null,
      engravingPrice: row.engravingPrice?.toString() ?? null,
      saleOrderRef: row.saleOrderRef,
      quoteId: row.quoteId ?? null,
      quoteItemId: row.quoteItemId ?? null,
      productImageUrl: row.quoteItem?.imageUrl?.trim() || null,
      engravingName: row.quoteItem?.engraving?.trim() || null,
      deliveryAddress: row.deliveryAddress ?? null,
      expectedArrival: row.expectedArrival?.toISOString() ?? null,
      observation: row.observation,
      requestedById: row.requestedById,
      requestedBy: row.requestedBy,
      resolvedById: row.resolvedById,
      resolvedBy: row.resolvedBy,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      purchasedAt: row.purchasedAt?.toISOString() ?? null,
      purchaseValue: row.purchaseValue?.toString() ?? null,
      refusalReason: row.refusalReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
