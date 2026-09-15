import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { normalizeItemName } from '../financeiro/conta-azul.itens-externos-xml';
import type { CreateExternalItemDto, UpdateExternalItemDto } from './dto/external-item.dto';

@Injectable()
export class ExternalItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private serialize(row: {
    id: string;
    name: string;
    description: string | null;
    lastKnownPrice: Prisma.Decimal;
    source: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lastKnownPrice: row.lastKnownPrice.toString(),
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(query: { search?: string; page?: number; pageSize?: number }) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim() ?? '';
    const where: Prisma.ExternalItemWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' } }
      : {};
    const [total, rows] = await this.prisma.client.$transaction([
      this.prisma.client.externalItem.count({ where }),
      this.prisma.client.externalItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((row) => this.serialize(row)),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async searchCatalogs(search: string) {
    const q = search.trim();
    if (q.length < 2) {
      return { weg: [], quote: [], external: [] };
    }
    const [weg, quote, external] = await Promise.all([
      this.prisma.client.product.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          price: true,
        },
        take: 8,
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.quoteCatalogProduct.findMany({
        where: {
          active: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { supplierCode: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          supplierCode: true,
          name: true,
          salePrice: true,
          supplier: true,
        },
        take: 8,
        orderBy: { name: 'asc' },
      }),
      this.prisma.client.externalItem.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 8,
      }),
    ]);
    return {
      weg: weg.map((row) => ({
        id: row.id,
        sku: row.sku,
        name: row.name,
        price: row.price.toString(),
        kind: 'weg' as const,
      })),
      quote: quote.map((row) => ({
        id: row.id,
        sku: row.supplierCode,
        name: row.name,
        price: row.salePrice.toString(),
        supplier: row.supplier,
        kind: 'quote' as const,
      })),
      external: external.map((row) => ({
        ...this.serialize(row),
        kind: 'external' as const,
      })),
    };
  }

  async ensureByName(input: {
    name: string;
    lastKnownPrice: number;
    source: string;
    description?: string | null;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Informe o nome do item externo.');
    const key = normalizeItemName(name);
    const existing = await this.prisma.client.externalItem.findMany({
      take: 50,
      orderBy: { createdAt: 'asc' },
    });
    const match = existing.find((row) => normalizeItemName(row.name) === key);
    const price = new Prisma.Decimal(Number(input.lastKnownPrice).toFixed(2));
    if (match) {
      if (price.greaterThan(0) && !match.lastKnownPrice.equals(price)) {
        const updated = await this.prisma.client.externalItem.update({
          where: { id: match.id },
          data: { lastKnownPrice: price },
        });
        return this.serialize(updated);
      }
      return this.serialize(match);
    }
    const created = await this.prisma.client.externalItem.create({
      data: {
        name,
        description: input.description?.trim() || null,
        lastKnownPrice: price,
        source: input.source.trim() || 'Manual',
      },
    });
    return this.serialize(created);
  }

  async create(userId: string, dto: CreateExternalItemDto) {
    const created = await this.ensureByName({
      name: dto.name,
      lastKnownPrice: dto.lastKnownPrice,
      source: dto.source?.trim() || 'Manual',
      description: dto.description,
    });
    await this.audit.log({
      userId,
      action: 'EXTERNAL_ITEM_CREATED',
      entity: 'ExternalItem',
      entityId: created.id,
      changes: { name: created.name, source: created.source },
    });
    return created;
  }

  async update(userId: string, id: string, dto: UpdateExternalItemDto) {
    const before = await this.prisma.client.externalItem.findUnique({
      where: { id },
    });
    if (!before) throw new NotFoundException('Item externo não encontrado.');
    const updated = await this.prisma.client.externalItem.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.lastKnownPrice != null
          ? {
              lastKnownPrice: new Prisma.Decimal(
                Number(dto.lastKnownPrice).toFixed(2),
              ),
            }
          : {}),
        ...(dto.source != null ? { source: dto.source.trim() } : {}),
      },
    });
    await this.audit.log({
      userId,
      action: 'EXTERNAL_ITEM_UPDATED',
      entity: 'ExternalItem',
      entityId: id,
      changes: { before: before.name, after: updated.name },
    });
    return this.serialize(updated);
  }
}
