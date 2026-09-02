import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PURCHASE_STAGES } from './compras.seed';
import { CreatePurchaseStageDto } from './dto/create-purchase-stage.dto';
import { UpdatePurchaseStageDto } from './dto/update-purchase-stage.dto';

type PurchaseStageRow = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  requiresPurchaseDetails: boolean;
  requiresReason: boolean;
  createdAt: Date;
};

/** CRUD das etapas do Kanban de Compras (mesmo padrão dos funis do CRM). */
@Injectable()
export class PurchaseStageService {
  constructor(private readonly prisma: PrismaService) {}

  async listar() {
    const rows = await this.prisma.client.purchaseStage.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => this.serialize(row));
  }

  async criar(dto: CreatePurchaseStageDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da etapa.');
    }

    let order = dto.order;
    if (order === undefined) {
      const max = await this.prisma.client.purchaseStage.aggregate({
        _max: { order: true },
      });
      order = (max._max.order ?? -1) + 1;
    }

    const created = await this.prisma.client.purchaseStage.create({
      data: {
        name,
        order,
        color: dto.color?.trim() || null,
        requiresPurchaseDetails: dto.requiresPurchaseDetails ?? false,
        requiresReason: dto.requiresReason ?? false,
      },
    });
    return this.serialize(created);
  }

  async atualizar(id: string, dto: UpdatePurchaseStageDto) {
    await this.assertExists(id);

    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Informe o nome da etapa.');
    }

    const updated = await this.prisma.client.purchaseStage.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.color !== undefined ? { color: dto.color?.trim() || null } : {}),
        ...(dto.requiresPurchaseDetails !== undefined
          ? { requiresPurchaseDetails: dto.requiresPurchaseDetails }
          : {}),
        ...(dto.requiresReason !== undefined
          ? { requiresReason: dto.requiresReason }
          : {}),
      },
    });
    return this.serialize(updated);
  }

  async deletar(id: string) {
    await this.assertExists(id);

    const emUso = await this.contarSolicitacoes(id);
    if (emUso > 0) {
      throw new BadRequestException(
        'Existem solicitações nesta etapa. Mova-as antes de excluir.',
      );
    }

    await this.prisma.client.purchaseStage.delete({ where: { id } });
    return { ok: true };
  }

  /** Etapa alvo de um movimento, para o serviço de solicitações validar flags. */
  async buscarPorId(id: string): Promise<PurchaseStageRow | null> {
    return this.prisma.client.purchaseStage.findUnique({ where: { id } });
  }

  private async assertExists(id: string) {
    const row = await this.prisma.client.purchaseStage.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException('Etapa de compra não encontrada.');
    }
  }

  /**
   * Conta solicitações na etapa. A etapa 'PEDIDO_ENVIADO_APROVADO' também
   * acumula o status legado 'COMPRADO', gravado pelo endpoint /comprado.
   */
  private async contarSolicitacoes(id: string) {
    const legacyComprado = DEFAULT_PURCHASE_STAGES.find(
      (stage) => stage.id === 'PEDIDO_ENVIADO_APROVADO',
    );
    const statuses =
      legacyComprado && id === legacyComprado.id ? [id, 'COMPRADO'] : [id];

    return this.prisma.client.purchaseRequest.count({
      where: { status: { in: statuses } },
    });
  }

  private serialize(row: PurchaseStageRow) {
    return {
      id: row.id,
      name: row.name,
      order: row.order,
      color: row.color,
      requiresPurchaseDetails: row.requiresPurchaseDetails,
      requiresReason: row.requiresReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
