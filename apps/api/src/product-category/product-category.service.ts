import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProductCategoryDto } from './dto/create-product-category.dto';
import type { ListProductCategoryQueryDto } from './dto/list-product-category-query.dto';
import type { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { slugifyName } from './slug';

/** Row shape from Prisma for ProductCategory — kept local so API compiles before/after prisma generate sync. */
export type ProductCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ProductCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(cat: ProductCategoryRecord) {
    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      color: cat.color ?? null,
      active: cat.active,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    };
  }

  async uniqueSlug(desiredBase: string) {
    const base =
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(desiredBase)
        ? desiredBase
        : slugifyName(desiredBase);
    let candidate = base.slice(0, 80);
    let i = 0;
    for (;;) {
      const exists = await this.prisma.client.productCategory.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      i += 1;
      candidate = `${base}-${i}`.slice(0, 80);
    }
  }

  async list(query: ListProductCategoryQueryDto) {
    const where: Prisma.ProductCategoryWhereInput = {};
    if (!query.includeInactive) {
      where.active = true;
    }
    const rows = await this.prisma.client.productCategory.findMany({
      where,
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((c) => this.serialize(c));
  }

  async create(dto: CreateProductCategoryDto) {
    const name = dto.name.trim();
    const baseSlugRaw =
      dto.slug?.trim()
        ? dto.slug.trim().toLowerCase()
        : slugifyName(name);

    try {
      const slug = await this.uniqueSlug(baseSlugRaw);

      const created = await this.prisma.client.productCategory.create({
        data: {
          name,
          slug,
          color: dto.color?.trim() ? dto.color.trim() : null,
        },
      });
      return this.serialize(created);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Já existe uma categoria com este nome.');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateProductCategoryDto) {
    const exists = await this.prisma.client.productCategory.findUnique({
      where: { id },
    });
    if (!exists) throw new NotFoundException('Categoria não encontrada.');

    try {
      const data: Prisma.ProductCategoryUpdateInput = {};
      if (dto.color !== undefined) {
        data.color =
          dto.color === null ? null : dto.color.trim() ? dto.color.trim() : null;
      }
      if (dto.active !== undefined) {
        data.active = dto.active;
      }

      let newName = exists.name;

      if (dto.name?.trim()?.length) {
        newName = dto.name.trim();
        data.name = newName;
        data.slug = await this.uniqueSlug(slugifyName(newName));
      }

      const updated = await this.prisma.client.productCategory.update({
        where: { id },
        data,
      });

      if (dto.name?.trim()?.length && newName !== exists.name) {
        await this.prisma.client.product.updateMany({
          where: { categoryId: id },
          data: { category: newName },
        });
      }

      return this.serialize(updated);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Nome de categoria já em uso.');
      }
      throw err;
    }
  }

  /** Soft delete: desativa mas mantém o histórico e FKs nos produtos. */
  async deactivate(id: string) {
    const exists = await this.prisma.client.productCategory.findUnique({
      where: { id },
      select: { id: true, active: true },
    });
    if (!exists) throw new NotFoundException('Categoria não encontrada.');
    if (!exists.active) {
      const cat = await this.prisma.client.productCategory.findUniqueOrThrow({
        where: { id },
      });
      return this.serialize(cat);
    }

    const updated = await this.prisma.client.productCategory.update({
      where: { id },
      data: { active: false },
    });
    return this.serialize(updated);
  }

  async assertActiveExists(id: string): Promise<ProductCategoryRecord> {
    const row = await this.prisma.client.productCategory.findUnique({
      where: { id },
    });
    if (!row) {
      throw new BadRequestException('Categoria não encontrada.');
    }
    if (!row.active) {
      throw new BadRequestException('Esta categoria está inativa. Escolha outra.');
    }
    return row;
  }
}
