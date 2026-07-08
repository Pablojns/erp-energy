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
import { R2StorageService } from '../storage/r2-storage.service';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestType,
} from './dto/create-purchase-request.dto';
import type { ListPurchaseRequestsQueryDto } from './dto/list-purchase-requests-query.dto';
import type { ResolvePurchaseRequestDto } from './dto/resolve-purchase-request.dto';

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
      supplier: { select: { id: true, name: true } },
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
      const supplierSku = dto.sku?.trim() || null;

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
      void this.notifications.createForPermission(
        'notificacoes',
        comprasAction,
        'Item recebido',
        `${itemLabel} chegou — separe os pedidos pendentes`,
        'compra_recebida',
        '/app/compras',
      );
    }

    return this.serialize(updated, true);
  }

  async atualizarQuantidade(
    id: string,
    dto: {
      suggestedQty?: number;
      quantity?: number;
      engravingPrice?: number | null;
    },
  ) {
    const existing = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, status: true, type: true },
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

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    const updated = await this.prisma.client.purchaseRequest.update({
      where: { id },
      data,
      include: PURCHASE_REQUEST_INCLUDE,
    });

    return this.serialize(updated, true);
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

    const object = await this.r2.getObject(image.imageKey);
    const filename = image.imageKey.split('/').pop() ?? 'imagem';

    return {
      stream: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
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
    };
  }

  private async uploadImages(
    files: Express.Multer.File[],
  ): Promise<string[]> {
    const keys: string[] = [];
    for (const file of files) {
      if (!file?.buffer?.length) continue;
      this.assertImageFile(file);
      const ext = this.extensionFromFile(file);
      const key = `compras/${randomUUID()}.${ext}`;
      await this.r2.upload(key, file.buffer, file.mimetype);
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
      row.images.map(async (image) => ({
        id: image.id,
        imageKey: image.imageKey,
        url: withImageUrls
          ? await this.r2.getSignedUrl(image.imageKey, IMAGE_SIGNED_URL_TTL)
          : null,
        createdAt: image.createdAt.toISOString(),
      })),
    );

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      priority: row.priority,
      productId: row.productId,
      product: row.product,
      suggestedQty: row.suggestedQty,
      sku: row.sku,
      itemName: row.itemName,
      quantity: row.quantity,
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
