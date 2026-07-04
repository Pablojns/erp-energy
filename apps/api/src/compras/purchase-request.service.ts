import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';
import {
  CreatePurchaseRequestDto,
  PurchaseRequestType,
} from './dto/create-purchase-request.dto';
import type { ListPurchaseRequestsQueryDto } from './dto/list-purchase-requests-query.dto';
import type { ResolvePurchaseRequestDto } from './dto/resolve-purchase-request.dto';

const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const LOGO_SIGNED_URL_TTL = 3600;

const PURCHASE_REQUEST_INCLUDE = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      internalCode: true,
      stockQty: true,
      minStock: true,
    },
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
  ) {}

  async criar(
    userId: string,
    dto: CreatePurchaseRequestDto,
    file?: Express.Multer.File,
  ) {
    const logoKey = await this.uploadLogoIfPresent(file);
    const common = this.buildCommonFields(userId, dto, logoKey);

    if (dto.type === PurchaseRequestType.WEG_CONTRATO) {
      if (!dto.productId?.trim()) {
        throw new BadRequestException('Informe o produto para solicitação WEG.');
      }

      const product = await this.prisma.client.product.findUnique({
        where: { id: dto.productId.trim() },
        select: { id: true, minStock: true, stockQty: true },
      });
      if (!product) {
        throw new NotFoundException('Produto não encontrado.');
      }

      const gap = product.minStock - product.stockQty;
      const suggestedQty = Math.max(1, dto.suggestedQty ?? gap);

      const created = await this.prisma.client.purchaseRequest.create({
        data: {
          ...common,
          type: dto.type,
          productId: product.id,
          suggestedQty,
        },
        include: PURCHASE_REQUEST_INCLUDE,
      });

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
      },
      include: PURCHASE_REQUEST_INCLUDE,
    });

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

  async atualizarStatus(id: string, status: string) {
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

    return this.serialize(updated, true);
  }

  async deletar(id: string) {
    const row = await this.prisma.client.purchaseRequest.findUnique({
      where: { id },
      select: { id: true, logoKey: true },
    });
    if (!row) {
      throw new NotFoundException('Solicitação de compra não encontrada.');
    }

    if (row.logoKey) {
      await this.r2.delete(row.logoKey);
    }

    await this.prisma.client.purchaseRequest.delete({ where: { id } });
    return { ok: true };
  }

  private buildCommonFields(
    userId: string,
    dto: CreatePurchaseRequestDto,
    logoKey: string | null,
  ) {
    return {
      priority: dto.priority ?? 'NORMAL',
      status: 'SOLICITADO',
      observation: dto.observation?.trim() || null,
      requestedById: userId,
      logoKey,
      supplierName: dto.supplierName?.trim() || null,
      itemPrice:
        dto.itemPrice != null ? new Prisma.Decimal(dto.itemPrice) : null,
      engravingPrice:
        dto.engravingPrice != null
          ? new Prisma.Decimal(dto.engravingPrice)
          : null,
      saleOrderRef: dto.saleOrderRef?.trim() || null,
      expectedArrival: dto.expectedArrival
        ? new Date(dto.expectedArrival)
        : null,
    };
  }

  private async uploadLogoIfPresent(
    file?: Express.Multer.File,
  ): Promise<string | null> {
    if (!file?.buffer?.length) {
      return null;
    }

    this.assertImageFile(file);

    const ext = this.extensionFromFile(file);
    const key = `compras/${randomUUID()}.${ext}`;
    await this.r2.upload(key, file.buffer, file.mimetype);
    return key;
  }

  private assertImageFile(file: Express.Multer.File) {
    if (file.size > LOGO_MAX_BYTES) {
      throw new BadRequestException('Logo deve ter no máximo 5MB.');
    }
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Logo deve ser uma imagem.');
    }
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

  private async serialize(row: PurchaseRequestRow, withLogoUrl = false) {
    let logoUrl: string | null = null;
    if (withLogoUrl && row.logoKey) {
      logoUrl = await this.r2.getSignedUrl(row.logoKey, LOGO_SIGNED_URL_TTL);
    }

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
      logoKey: row.logoKey,
      logoUrl,
      supplierName: row.supplierName,
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
