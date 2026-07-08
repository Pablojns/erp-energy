import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Product } from '@erp/database';
import { AuditService } from '../common/audit.service';
import { ProductCategoryService } from '../product-category/product-category.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductDto } from './dto/create-product.dto';
import type { ProductQueryDto } from './dto/product-query.dto';
import type { UpdateProductDto } from './dto/update-product.dto';

const SORT_FIELDS = [
  'name',
  'internalCode',
  'sku',
  'createdAt',
  'updatedAt',
  'stockQty',
  'price',
  'minStock',
  'category',
] as const;

type SortField = (typeof SORT_FIELDS)[number];

export type ProductWithCategory = Product & {
  productCategory: {
    id: string;
    name: string;
    slug: string;
    color: string | null;
    active: boolean;
  } | null;
  supplier?: { id: string; name: string } | null;
};

const PRODUCT_INCLUDE = {
  productCategory: true,
  supplier: { select: { id: true, name: true } },
} as const satisfies Prisma.ProductInclude;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly productCategories: ProductCategoryService,
  ) {}

  private serialize(product: ProductWithCategory) {
    const pc = product.productCategory;
    let categoryMeta:
      | {
          entity: true;
          id: string;
          name: string;
          slug: string;
          color: string | null;
          inactiveCategory: boolean;
        }
      | { legacy: true; label: string }
      | null = null;

    if (pc) {
      categoryMeta = {
        entity: true,
        id: pc.id,
        name: pc.name,
        slug: pc.slug,
        color: pc.color ?? null,
        inactiveCategory: !pc.active,
      };
    } else if (product.category?.trim()) {
      categoryMeta = { legacy: true, label: product.category.trim() };
    }

    return {
      id: product.id,
      internalCode: product.internalCode,
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      categoryId: product.categoryId ?? null,
      category: pc?.name ?? product.category ?? null,
      categoryMeta,
      price: product.price.toString(),
      cost: product.cost?.toString() ?? null,
      minStock: product.minStock,
      stockQty: product.stockQty,
      reservedQty: product.reservedQty,
      availableQty: product.stockQty - product.reservedQty,
      isActive: product.isActive,
      supplierId: product.supplierId ?? null,
      supplierName: product.supplier?.name ?? null,
      supplier: product.supplier ?? null,
      supplierSku: product.supplierSku?.trim() || null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  async create(userId: string, dto: CreateProductDto) {
    let categoryId: string | null = null;
    let categoryLegacy: string | null = null;

    if (dto.categoryId?.trim()) {
      const cat = await this.productCategories.assertActiveExists(
        dto.categoryId.trim(),
      );
      categoryId = cat.id;
      categoryLegacy = cat.name;
    } else if (dto.category?.trim()) {
      categoryLegacy = dto.category.trim();
    }

    try {
      const sku = dto.sku.trim();
      const name = dto.name.trim();
      const internalCode =
        dto.internalCode?.trim() && dto.internalCode.trim().length > 0
          ? dto.internalCode.trim()
          : sku;
      const description =
        dto.description?.trim() && dto.description.trim().length > 0
          ? dto.description.trim()
          : name;

      const product = await this.prisma.client.product.create({
        data: {
          internalCode,
          sku,
          name,
          description,
          categoryId,
          category: categoryLegacy,
          price: new Prisma.Decimal(Number(dto.price).toFixed(2)),
          cost:
            dto.cost === undefined || dto.cost === null
              ? null
              : new Prisma.Decimal(Number(dto.cost).toFixed(2)),
          minStock: dto.minStock,
          stockQty: 0,
          isActive: true,
          supplierId: dto.supplierId?.trim() || null,
          supplierSku: dto.supplierSku?.trim() || null,
        } as Prisma.ProductUncheckedCreateInput,
        include: PRODUCT_INCLUDE,
      });

      await this.audit.log({
        userId,
        action: 'PRODUCT_CREATED',
        entity: 'Product',
        entityId: product.id,
        changes: this.serialize(product as ProductWithCategory),
      });

      return this.serialize(product as ProductWithCategory);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('SKU ou código interno já cadastrado.');
      }
      throw err;
    }
  }

  async findAll(query: ProductQueryDto) {
    const page = query.page !== undefined && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize !== undefined &&
      query.pageSize > 0 &&
      query.pageSize <= 100
        ? query.pageSize
        : 20;

    const clauses: Prisma.ProductWhereInput[] = [];

    if (query.search?.trim()) {
      const term = query.search.trim();
      clauses.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { internalCode: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { supplierSku: { contains: term, mode: 'insensitive' } },
          { category: { contains: term, mode: 'insensitive' } },
          {
            productCategory: {
              name: { contains: term, mode: 'insensitive' },
            },
          },
        ],
      });
    }

    if (query.status === 'active') {
      clauses.push({ isActive: true });
    } else if (query.status === 'inactive') {
      clauses.push({ isActive: false });
    }

    if (query.categoryId?.trim()) {
      clauses.push({ categoryId: query.categoryId.trim() });
    } else if (query.category?.trim()) {
      const v = query.category.trim();
      clauses.push({
        OR: [
          { category: { equals: v, mode: 'insensitive' } },
          {
            productCategory: { name: { equals: v, mode: 'insensitive' } },
          },
        ],
      });
    }

    let baseWhere: Prisma.ProductWhereInput =
      clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses };

    if (query.lowStock) {
      const candidates = await this.prisma.client.product.findMany({
        where: baseWhere,
        select: { id: true, stockQty: true, minStock: true },
      });
      const ids = candidates
        .filter((p) => p.stockQty < p.minStock)
        .map((p) => p.id);
      baseWhere =
        clauses.length === 0
          ? { id: { in: ids } }
          : { AND: [...clauses, { id: { in: ids } }] };
    }

    const sortBy: SortField = SORT_FIELDS.includes(query.sortBy as SortField)
      ? (query.sortBy as SortField)
      : 'name';
    const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';
    let orderBy: Prisma.ProductOrderByWithRelationInput;
    if (sortBy === 'category') {
      orderBy = { productCategory: { name: sortOrder } };
    } else {
      orderBy = {
        [sortBy]: sortOrder,
      } as Prisma.ProductOrderByWithRelationInput;
    }

    const total = await this.prisma.client.product.count({ where: baseWhere });
    const rows = await this.prisma.client.product.findMany({
      where: baseWhere,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: PRODUCT_INCLUDE,
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      data: rows.map((p) => this.serialize(p as ProductWithCategory)),
      meta: {
        page,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    return this.serialize(product as ProductWithCategory);
  }

  async update(id: string, userId: string, dto: UpdateProductDto) {
    await this.ensureExists(id);
    try {
      const before = await this.prisma.client.product.findUnique({
        where: { id },
        include: { productCategory: true } as Prisma.ProductInclude,
      });

      const data: Prisma.ProductUncheckedUpdateInput = {};
      if (dto.sku !== undefined) {
        data.sku = dto.sku.trim();
      }
      if (dto.internalCode !== undefined) {
        data.internalCode = dto.internalCode.trim();
      } else if (dto.sku !== undefined) {
        data.internalCode = dto.sku.trim();
      }
      if (dto.name !== undefined) {
        data.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        data.description = dto.description.trim();
      } else if (dto.name !== undefined) {
        data.description = dto.name.trim();
      }

      if (dto.categoryId !== undefined) {
        if (dto.categoryId === null) {
          data.categoryId = null;
          data.category = null;
        } else {
          const cat = await this.productCategories.assertActiveExists(
            dto.categoryId.trim(),
          );
          data.categoryId = cat.id;
          data.category = cat.name;
        }
      } else if (dto.category !== undefined) {
        data.category = dto.category?.trim() ? dto.category.trim() : null;
        data.categoryId = null;
      }

      if (dto.price !== undefined) {
        data.price = new Prisma.Decimal(Number(dto.price).toFixed(2));
      }
      if (dto.cost !== undefined) {
        data.cost =
          dto.cost === null
            ? null
            : new Prisma.Decimal(Number(dto.cost).toFixed(2));
      }
      if (dto.minStock !== undefined) {
        data.minStock = dto.minStock;
      }
      if (dto.isActive !== undefined) {
        data.isActive = dto.isActive;
      }
      if (dto.supplierId !== undefined) {
        data.supplierId = dto.supplierId?.trim() ? dto.supplierId.trim() : null;
      }
      if (dto.supplierSku !== undefined) {
        data.supplierSku = dto.supplierSku?.trim() ? dto.supplierSku.trim() : null;
      }

      const product = await this.prisma.client.product.update({
        where: { id },
        data,
        include: PRODUCT_INCLUDE,
      });

      await this.syncLinkedPurchaseRequests(product.id);

      await this.audit.log({
        userId,
        action: 'PRODUCT_UPDATED',
        entity: 'Product',
        entityId: id,
        changes: {
          before: before ? this.serialize(before as ProductWithCategory) : null,
          after: this.serialize(product as ProductWithCategory),
        },
      });

      return this.serialize(product as ProductWithCategory);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('SKU ou código interno já cadastrado.');
      }
      throw err;
    }
  }

  async reactivate(id: string, userId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: { productCategory: true } as Prisma.ProductInclude,
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    if (product.isActive) {
      return this.serialize(product as ProductWithCategory);
    }

    const updated = await this.prisma.client.product.update({
      where: { id },
      data: { isActive: true },
      include: { productCategory: true } as Prisma.ProductInclude,
    });

    await this.audit.log({
      userId,
      action: 'PRODUCT_REACTIVATED',
      entity: 'Product',
      entityId: id,
      changes: { isActive: true },
    });

    return this.serialize(updated as ProductWithCategory);
  }

  async softDelete(id: string, userId: string) {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: { productCategory: true } as Prisma.ProductInclude,
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }
    if (!product.isActive) {
      return this.serialize(product as ProductWithCategory);
    }

    const updated = await this.prisma.client.product.update({
      where: { id },
      data: { isActive: false },
      include: { productCategory: true } as Prisma.ProductInclude,
    });

    await this.audit.log({
      userId,
      action: 'PRODUCT_DEACTIVATED',
      entity: 'Product',
      entityId: id,
      changes: { isActive: false },
    });

    return this.serialize(updated as ProductWithCategory);
  }

  private async syncLinkedPurchaseRequests(productId: string): Promise<void> {
    const product = await this.prisma.client.product.findUnique({
      where: { id: productId },
      select: {
        name: true,
        sku: true,
        supplierSku: true,
        supplier: { select: { name: true } },
      },
    });
    if (!product) return;

    const supplierName =
      product.supplier?.name?.trim() ||
      (await this.matchSupplierFromText(`${product.name} ${product.sku}`));
    const supplierSku = product.supplierSku?.trim() || null;

    await this.prisma.client.purchaseRequest.updateMany({
      where: {
        productId,
        type: 'WEG_CONTRATO',
        status: { not: 'RECUSADO' },
      },
      data: {
        supplierName,
        sku: supplierSku,
      },
    });
  }

  private async matchSupplierFromText(text: string): Promise<string | null> {
    const suppliers = await this.prisma.client.supplier.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const haystack = text.toUpperCase();
    const sorted = [...suppliers].sort((a, b) => b.name.length - a.name.length);
    for (const supplier of sorted) {
      const name = supplier.name.trim();
      if (name.length >= 2 && haystack.includes(name.toUpperCase())) {
        return name;
      }
    }
    return null;
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.client.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Produto não encontrado.');
    }
  }
}
