import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateEngravingTechniqueDto } from './dto/create-engraving-technique.dto';
import type { UpdateEngravingTechniqueDto } from './dto/update-engraving-technique.dto';
import {
  groupEngravingRowsByName,
  readEngravingSheet,
  type EngravingImportSummary,
} from './engraving-import';

function toDecimal(value: number | undefined | null): Prisma.Decimal | null {
  if (value == null || !Number.isFinite(value)) return null;
  return new Prisma.Decimal(Number(value).toFixed(4));
}

function mapTechnique(row: {
  id: string;
  name: string;
  active: boolean;
  calculationType: string;
  multiplyColors: boolean;
  supplierCompany: string | null;
  createdAt: Date;
  updatedAt: Date;
  tiers: Array<{
    id: string;
    qtyFrom: number;
    qtyTo: number;
    cost: Prisma.Decimal;
    costType: string;
    fixedFee: Prisma.Decimal | null;
    applicationCost: Prisma.Decimal | null;
  }>;
}) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    calculationType: row.calculationType,
    multiplyColors: row.multiplyColors,
    supplierCompany: row.supplierCompany,
    tierCount: row.tiers.length,
    tiers: row.tiers.map((tier) => ({
      id: tier.id,
      qtyFrom: tier.qtyFrom,
      qtyTo: tier.qtyTo,
      cost: tier.cost.toString(),
      costType: tier.costType,
      fixedFee: tier.fixedFee?.toString() ?? '0',
      applicationCost: tier.applicationCost?.toString() ?? '0',
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class EngravingService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.client.engravingTechnique.findMany({
      orderBy: { name: 'asc' },
      include: {
        tiers: { orderBy: [{ qtyFrom: 'asc' }, { qtyTo: 'asc' }] },
      },
    });
    return { data: rows.map(mapTechnique) };
  }

  async create(dto: CreateEngravingTechniqueDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Informe o nome da técnica.');
    if (!dto.tiers?.length) {
      throw new BadRequestException('Informe ao menos uma faixa de preço.');
    }

    const existing = await this.prisma.client.engravingTechnique.findUnique({
      where: { name },
    });
    if (existing) {
      throw new BadRequestException(`Já existe técnica com o nome "${name}".`);
    }

    const created = await this.prisma.client.engravingTechnique.create({
      data: {
        name,
        calculationType: dto.calculationType?.trim() || 'Unidade/Intervalo',
        multiplyColors: dto.multiplyColors ?? false,
        supplierCompany: dto.supplierCompany?.trim() || null,
        active: dto.active ?? true,
        tiers: {
          create: dto.tiers.map((tier) => ({
            qtyFrom: tier.qtyFrom,
            qtyTo: tier.qtyTo,
            cost: toDecimal(tier.cost) ?? new Prisma.Decimal('0'),
            costType: tier.costType,
            fixedFee: toDecimal(tier.fixedFee ?? 0),
            applicationCost: toDecimal(tier.applicationCost ?? 0),
          })),
        },
      },
      include: {
        tiers: { orderBy: [{ qtyFrom: 'asc' }, { qtyTo: 'asc' }] },
      },
    });

    return mapTechnique(created);
  }

  async update(id: string, dto: UpdateEngravingTechniqueDto) {
    const existing = await this.prisma.client.engravingTechnique.findUnique({
      where: { id },
      include: { tiers: true },
    });
    if (!existing) throw new NotFoundException('Técnica de gravação não encontrada.');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Nome inválido.');
      const conflict = await this.prisma.client.engravingTechnique.findFirst({
        where: { name, NOT: { id } },
      });
      if (conflict) {
        throw new BadRequestException(`Já existe técnica com o nome "${name}".`);
      }
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      if (dto.tiers) {
        if (!dto.tiers.length) {
          throw new BadRequestException('Informe ao menos uma faixa de preço.');
        }
        await tx.engravingPriceTier.deleteMany({ where: { techniqueId: id } });
        await tx.engravingPriceTier.createMany({
          data: dto.tiers.map((tier) => ({
            techniqueId: id,
            qtyFrom: tier.qtyFrom,
            qtyTo: tier.qtyTo,
            cost: toDecimal(tier.cost) ?? new Prisma.Decimal('0'),
            costType: tier.costType,
            fixedFee: toDecimal(tier.fixedFee ?? 0),
            applicationCost: toDecimal(tier.applicationCost ?? 0),
          })),
        });
      }

      return tx.engravingTechnique.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.calculationType !== undefined
            ? { calculationType: dto.calculationType.trim() || 'Unidade/Intervalo' }
            : {}),
          ...(dto.multiplyColors !== undefined
            ? { multiplyColors: dto.multiplyColors }
            : {}),
          ...(dto.supplierCompany !== undefined
            ? { supplierCompany: dto.supplierCompany?.trim() || null }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        include: {
          tiers: { orderBy: [{ qtyFrom: 'asc' }, { qtyTo: 'asc' }] },
        },
      });
    });

    return mapTechnique(updated);
  }

  async remove(id: string) {
    const existing = await this.prisma.client.engravingTechnique.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Técnica de gravação não encontrada.');
    await this.prisma.client.engravingTechnique.delete({ where: { id } });
    return { ok: true };
  }

  async importFromExcel(buffer: Uint8Array): Promise<EngravingImportSummary> {
    const summary: EngravingImportSummary = {
      criadas: 0,
      atualizadas: 0,
      faixas: 0,
      ignoradas: 0,
      erros: [],
    };

    const parsed = readEngravingSheet(buffer);
    summary.ignoradas = parsed.ignored;

    if (!parsed.rows.length) {
      throw new BadRequestException(
        'Planilha vazia ou sem coluna "Nome". Verifique o formato do Excel.',
      );
    }

    const grouped = groupEngravingRowsByName(parsed.rows);

    for (const [name, rows] of grouped.entries()) {
      try {
        const header = rows[0]!;
        const existing = await this.prisma.client.engravingTechnique.findUnique({
          where: { name },
        });

        const techniqueId = await this.prisma.client.$transaction(async (tx) => {
          let id: string;
          if (existing) {
            const updated = await tx.engravingTechnique.update({
              where: { id: existing.id },
              data: {
                calculationType: header.calculationType,
                multiplyColors: header.multiplyColors,
                supplierCompany: header.supplierCompany,
                active: true,
              },
            });
            id = updated.id;
            await tx.engravingPriceTier.deleteMany({ where: { techniqueId: id } });
            summary.atualizadas += 1;
          } else {
            const created = await tx.engravingTechnique.create({
              data: {
                name,
                calculationType: header.calculationType,
                multiplyColors: header.multiplyColors,
                supplierCompany: header.supplierCompany,
                active: true,
              },
            });
            id = created.id;
            summary.criadas += 1;
          }

          await tx.engravingPriceTier.createMany({
            data: rows.map((row) => ({
              techniqueId: id,
              qtyFrom: row.qtyFrom,
              qtyTo: row.qtyTo,
              cost: toDecimal(row.cost) ?? new Prisma.Decimal('0'),
              costType: row.costType,
              fixedFee: toDecimal(row.fixedFee),
              applicationCost: toDecimal(row.applicationCost),
            })),
          });

          summary.faixas += rows.length;
          return id;
        });

        void techniqueId;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'erro desconhecido';
        summary.erros.push(`${name}: ${msg}`);
      }
    }

    return summary;
  }
}
