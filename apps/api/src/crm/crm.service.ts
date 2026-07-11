import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCrmCardDto } from './dto/create-crm-card.dto';
import type { CreateCrmChannelDto } from './dto/create-crm-channel.dto';
import type { CreateCrmFunilDto } from './dto/create-crm-funil.dto';
import type { CreateCrmStatusDto } from './dto/create-crm-status.dto';
import type { CrmDashboardQueryDto } from './dto/crm-dashboard-query.dto';
import type { UpdateCrmCardDto } from './dto/update-crm-card.dto';
import type { UpdateCrmChannelDto } from './dto/update-crm-channel.dto';
import type { UpdateCrmFunilDto } from './dto/update-crm-funil.dto';
import type { UpdateCrmStatusDto } from './dto/update-crm-status.dto';
import type { UpsertCrmTouchpointsDto } from './dto/upsert-crm-touchpoints.dto';
import { CRM_CARD_ORIGINS } from './dto/create-crm-card.dto';
import {
  getCrmStatusIdByName,
  getDefaultCrmStatusId,
} from './crm.seed';

type CrmFunilRow = {
  id: string;
  name: string;
  order: number;
  color: string | null;
  createdAt: Date;
};

type CrmStatusRow = {
  id: string;
  name: string;
  color: string;
  order: number;
};

type CrmChannelRow = {
  id: string;
  name: string;
  color: string;
};

type CrmTouchpointRow = {
  id: string;
  cardId: string;
  number: number;
  done: boolean;
  date: Date | null;
  channel: string | null;
  createdAt: Date;
};

type CrmCardRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  value: Prisma.Decimal | null;
  origin: string;
  touchPoints: number;
  notes: string | null;
  whatsappLog: string | null;
  observations: string | null;
  prospectionDate: Date | null;
  contactsToday: number | null;
  convertedToMeeting: number | null;
  funilId: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  status: string;
  funil?: CrmFunilRow;
  touchpointRecords?: CrmTouchpointRow[];
};

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  private serializeFunil(row: CrmFunilRow) {
    return {
      id: row.id,
      name: row.name,
      order: row.order,
      color: row.color,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeStatus(row: CrmStatusRow) {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      order: row.order,
    };
  }

  private serializeChannel(row: CrmChannelRow) {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
    };
  }

  private serializeTouchpoint(row: CrmTouchpointRow) {
    return {
      id: row.id,
      cardId: row.cardId,
      number: row.number,
      done: row.done,
      date: row.date?.toISOString() ?? null,
      channel: row.channel,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private serializeCard(
    row: CrmCardRow,
    statusMap?: Map<string, CrmStatusRow>,
  ) {
    const statusMeta = statusMap?.get(row.status);
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      value: row.value != null ? row.value.toString() : null,
      origin: row.origin,
      touchPoints: row.touchPoints,
      notes: row.notes,
      whatsappLog: row.whatsappLog,
      observations: row.observations,
      prospectionDate: row.prospectionDate?.toISOString() ?? null,
      contactsToday: row.contactsToday,
      convertedToMeeting: row.convertedToMeeting,
      funilId: row.funilId,
      funil: row.funil ? this.serializeFunil(row.funil) : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      status: row.status,
      statusMeta: statusMeta ? this.serializeStatus(statusMeta) : undefined,
      touchpoints: row.touchpointRecords
        ? row.touchpointRecords
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((tp) => this.serializeTouchpoint(tp))
        : undefined,
    };
  }

  private isOrcamentoFunilName(name: string): boolean {
    const normalized = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');
    return normalized.includes('orc') || normalized.includes('orç');
  }

  private async loadStatusMap() {
    const rows = await this.prisma.client.crmStatus.findMany();
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async resolveClosedStatusIds() {
    const rows = await this.prisma.client.crmStatus.findMany({
      where: { name: { in: ['Fechado', 'Perdido'] } },
    });
    const fechadoId = rows.find((r) => r.name === 'Fechado')?.id;
    const perdidoId = rows.find((r) => r.name === 'Perdido')?.id;
    return { fechadoId, perdidoId, closedIds: rows.map((r) => r.id) };
  }

  private isClosedStatus(
    status: string,
    statusMap: Map<string, CrmStatusRow>,
    fechadoId?: string,
    perdidoId?: string,
  ) {
    if (status === fechadoId || status === perdidoId) return true;
    const meta = statusMap.get(status);
    return meta?.name === 'Fechado' || meta?.name === 'Perdido';
  }

  private isFechadoStatus(
    status: string,
    statusMap: Map<string, CrmStatusRow>,
    fechadoId?: string,
  ) {
    if (status === fechadoId) return true;
    return statusMap.get(status)?.name === 'Fechado';
  }

  async listStatuses() {
    const rows = await this.prisma.client.crmStatus.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.serializeStatus(r));
  }

  async createStatus(dto: CreateCrmStatusDto) {
    let order = dto.order;
    if (order === undefined) {
      const max = await this.prisma.client.crmStatus.aggregate({
        _max: { order: true },
      });
      order = (max._max.order ?? -1) + 1;
    }

    const created = await this.prisma.client.crmStatus.create({
      data: {
        name: dto.name.trim(),
        color: dto.color?.trim() || '#6366f1',
        order,
      },
    });
    return this.serializeStatus(created);
  }

  async updateStatus(id: string, dto: UpdateCrmStatusDto) {
    await this.assertStatusExists(id);
    const updated = await this.prisma.client.crmStatus.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color.trim() } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
      },
    });
    return this.serializeStatus(updated);
  }

  async deleteStatus(id: string) {
    await this.assertStatusExists(id);
    const cardCount = await this.prisma.client.crmCard.count({
      where: { status: id },
    });
    if (cardCount > 0) {
      throw new BadRequestException(
        'Existem cards usando este status. Altere-os antes de excluir.',
      );
    }
    await this.prisma.client.crmStatus.delete({ where: { id } });
    return { ok: true };
  }

  async listChannels() {
    const rows = await this.prisma.client.crmChannel.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.serializeChannel(r));
  }

  async createChannel(dto: CreateCrmChannelDto) {
    const created = await this.prisma.client.crmChannel.create({
      data: {
        name: dto.name.trim(),
        color: dto.color?.trim() || '#22c55e',
      },
    });
    return this.serializeChannel(created);
  }

  async updateChannel(id: string, dto: UpdateCrmChannelDto) {
    await this.assertChannelExists(id);
    const updated = await this.prisma.client.crmChannel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.color !== undefined ? { color: dto.color.trim() } : {}),
      },
    });
    return this.serializeChannel(updated);
  }

  async deleteChannel(id: string) {
    await this.assertChannelExists(id);
    await this.prisma.client.crmChannel.delete({ where: { id } });
    return { ok: true };
  }

  async listFunis() {
    const rows = await this.prisma.client.crmFunil.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.serializeFunil(r));
  }

  async createFunil(dto: CreateCrmFunilDto) {
    let order = dto.order;
    if (order === undefined) {
      const max = await this.prisma.client.crmFunil.aggregate({
        _max: { order: true },
      });
      order = (max._max.order ?? -1) + 1;
    }

    const created = await this.prisma.client.crmFunil.create({
      data: {
        name: dto.name.trim(),
        order,
        color: dto.color?.trim() || null,
      },
    });
    return this.serializeFunil(created);
  }

  async updateFunil(id: string, dto: UpdateCrmFunilDto) {
    await this.assertFunilExists(id);
    const updated = await this.prisma.client.crmFunil.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.color !== undefined
          ? { color: dto.color?.trim() || null }
          : {}),
      },
    });
    return this.serializeFunil(updated);
  }

  async deleteFunil(id: string) {
    await this.assertFunilExists(id);
    const cardCount = await this.prisma.client.crmCard.count({
      where: { funilId: id },
    });
    if (cardCount > 0) {
      throw new BadRequestException(
        'Remova ou mova os cards deste funil antes de excluí-lo.',
      );
    }
    await this.prisma.client.crmFunil.delete({ where: { id } });
    return { ok: true };
  }

  async listCards() {
    const [rows, statusMap] = await Promise.all([
      this.prisma.client.crmCard.findMany({
        include: { funil: true },
        orderBy: [{ createdAt: 'desc' }],
      }),
      this.loadStatusMap(),
    ]);
    return rows.map((r) => this.serializeCard(r, statusMap));
  }

  async getCard(id: string) {
    const row = await this.prisma.client.crmCard.findUnique({
      where: { id },
      include: {
        funil: true,
        touchpointRecords: { orderBy: { number: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException('Card não encontrado.');
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(row, statusMap);
  }

  async createCard(dto: CreateCrmCardDto) {
    await this.assertFunilExists(dto.funilId);
    const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
    const created = await this.prisma.client.crmCard.create({
      data: {
        name: dto.name.trim(),
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        value:
          dto.value != null && dto.value > 0
            ? new Prisma.Decimal(dto.value)
            : null,
        origin: dto.origin,
        touchPoints: dto.touchPoints ?? 0,
        notes: dto.notes?.trim() || null,
        whatsappLog: dto.whatsappLog?.trim() || null,
        funilId: dto.funilId,
        status: defaultStatusId,
      },
      include: { funil: true, touchpointRecords: true },
    });
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(created, statusMap);
  }

  async updateCard(id: string, dto: UpdateCrmCardDto) {
    const before = await this.assertCardExists(id);
    if (dto.funilId && dto.funilId !== before.funilId) {
      await this.assertFunilExists(dto.funilId);
    }
    if (dto.status) {
      await this.assertStatusExists(dto.status);
    }

    const { fechadoId, perdidoId } = await this.resolveClosedStatusIds();

    const data: Prisma.CrmCardUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.value !== undefined) {
      data.value =
        dto.value != null && dto.value > 0
          ? new Prisma.Decimal(dto.value)
          : null;
    }
    if (dto.origin !== undefined) data.origin = dto.origin;
    if (dto.touchPoints !== undefined) data.touchPoints = dto.touchPoints;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.whatsappLog !== undefined) {
      data.whatsappLog = dto.whatsappLog?.trim() || null;
    }
    if (dto.observations !== undefined) {
      data.observations = dto.observations?.trim() || null;
    }
    if (dto.prospectionDate !== undefined) {
      data.prospectionDate = dto.prospectionDate
        ? new Date(dto.prospectionDate)
        : null;
    }
    if (dto.contactsToday !== undefined) {
      data.contactsToday = dto.contactsToday;
    }
    if (dto.convertedToMeeting !== undefined) {
      data.convertedToMeeting = dto.convertedToMeeting;
    }
    if (dto.funilId !== undefined) {
      data.funil = { connect: { id: dto.funilId } };
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === fechadoId || dto.status === perdidoId) {
        data.closedAt = new Date();
      } else {
        data.closedAt = null;
      }
    }

    const updated = await this.prisma.client.crmCard.update({
      where: { id },
      data,
      include: {
        funil: true,
        touchpointRecords: { orderBy: { number: 'asc' } },
      },
    });
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(updated, statusMap);
  }

  async upsertTouchpoints(id: string, dto: UpsertCrmTouchpointsDto) {
    await this.assertCardExists(id);

    await this.prisma.client.$transaction(
      dto.touchpoints.map((tp) =>
        this.prisma.client.crmTouchpoint.upsert({
          where: {
            cardId_number: { cardId: id, number: tp.number },
          },
          create: {
            cardId: id,
            number: tp.number,
            done: tp.done,
            date: tp.date ? new Date(tp.date) : null,
            channel: tp.channel?.trim() || null,
          },
          update: {
            done: tp.done,
            date: tp.date ? new Date(tp.date) : null,
            channel: tp.channel?.trim() || null,
          },
        }),
      ),
    );

    const doneCount = dto.touchpoints.filter((tp) => tp.done).length;
    await this.prisma.client.crmCard.update({
      where: { id },
      data: { touchPoints: doneCount },
    });

    return this.getCard(id);
  }

  async deleteCard(id: string) {
    await this.assertCardExists(id);
    await this.prisma.client.crmCard.delete({ where: { id } });
    return { ok: true };
  }

  async moveCard(id: string, funilId: string) {
    await this.assertCardExists(id);
    await this.assertFunilExists(funilId);
    const updated = await this.prisma.client.crmCard.update({
      where: { id },
      data: { funilId },
      include: { funil: true, touchpointRecords: true },
    });
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(updated, statusMap);
  }

  async getDashboard(query: CrmDashboardQueryDto) {
    const originFilter =
      query.origin && query.origin !== 'TODOS' ? query.origin : undefined;

    const where: Prisma.CrmCardWhereInput = originFilter
      ? { origin: originFilter }
      : {};

    const [cards, funis, statusMap, { fechadoId }] = await Promise.all([
      this.prisma.client.crmCard.findMany({
        where,
        include: { funil: true },
      }),
      this.prisma.client.crmFunil.findMany({
        orderBy: { order: 'asc' },
      }),
      this.loadStatusMap(),
      this.resolveClosedStatusIds(),
    ]);

    const orcamentoFunilIds = new Set(
      funis.filter((f) => this.isOrcamentoFunilName(f.name)).map((f) => f.id),
    );

    const isOrcamento = (card: {
      funilId: string;
      value: Prisma.Decimal | null;
    }) =>
      orcamentoFunilIds.has(card.funilId) ||
      (card.value != null && Number(card.value) > 0);

    const isFechado = (status: string) =>
      this.isFechadoStatus(status, statusMap, fechadoId);

    const leads = cards.length;
    const orcamentos = cards.filter(isOrcamento).length;
    const fechados = cards.filter((c) => isFechado(c.status)).length;
    const fechadosCards = cards.filter((c) => isFechado(c.status));
    const valorFechado = fechadosCards.reduce(
      (sum, c) => sum + Number(c.value ?? 0),
      0,
    );
    const ticketMedio = fechados > 0 ? valorFechado / fechados : 0;

    const taxaLeadOrcamento = leads > 0 ? (orcamentos / leads) * 100 : 0;
    const taxaLeadFechado = leads > 0 ? (fechados / leads) * 100 : 0;
    const taxaOrcamentoFechado =
      orcamentos > 0 ? (fechados / orcamentos) * 100 : 0;

    const ciclosDias = fechadosCards
      .filter((c) => c.closedAt)
      .map(
        (c) =>
          (c.closedAt!.getTime() - c.createdAt.getTime()) /
          (1000 * 60 * 60 * 24),
      );
    const cicloMedioDias =
      ciclosDias.length > 0
        ? ciclosDias.reduce((a, b) => a + b, 0) / ciclosDias.length
        : 0;

    const touchpointsMedios =
      cards.length > 0
        ? cards.reduce((s, c) => s + c.touchPoints, 0) / cards.length
        : 0;

    const porOrigem = CRM_CARD_ORIGINS.map((origin) => {
      const subset = cards.filter((c) => c.origin === origin);
      const subsetLeads = subset.length;
      const subsetFechados = subset.filter((c) => isFechado(c.status)).length;
      const subsetOrcamentos = subset.filter(isOrcamento).length;
      const subsetCiclos = subset
        .filter((c) => isFechado(c.status) && c.closedAt)
        .map(
          (c) =>
            (c.closedAt!.getTime() - c.createdAt.getTime()) /
            (1000 * 60 * 60 * 24),
        );
      const subsetTouch =
        subset.length > 0
          ? subset.reduce((s, c) => s + c.touchPoints, 0) / subset.length
          : 0;

      return {
        origin,
        leads: subsetLeads,
        orcamentos: subsetOrcamentos,
        fechados: subsetFechados,
        taxaLeadFechado:
          subsetLeads > 0 ? (subsetFechados / subsetLeads) * 100 : 0,
        cicloMedioDias:
          subsetCiclos.length > 0
            ? subsetCiclos.reduce((a, b) => a + b, 0) / subsetCiclos.length
            : 0,
        touchpointsMedios: subsetTouch,
      };
    });

    return {
      filter: originFilter ?? 'TODOS',
      resumo: {
        leads,
        orcamentos,
        fechados,
        valorFechado,
        ticketMedio,
        taxaLeadOrcamento,
        taxaLeadFechado,
        taxaOrcamentoFechado,
        cicloMedioDias,
        touchpointsMedios,
      },
      porOrigem,
    };
  }

  async markCardStatusByName(id: string, statusName: 'Fechado' | 'Perdido') {
    const statusId = await getCrmStatusIdByName(this.prisma.client, statusName);
    if (!statusId) {
      throw new BadRequestException(`Status "${statusName}" não encontrado.`);
    }
    return this.updateCard(id, { status: statusId });
  }

  private async assertFunilExists(id: string) {
    const row = await this.prisma.client.crmFunil.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Funil não encontrado.');
    return row;
  }

  private async assertStatusExists(id: string) {
    const row = await this.prisma.client.crmStatus.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Status não encontrado.');
    return row;
  }

  private async assertChannelExists(id: string) {
    const row = await this.prisma.client.crmChannel.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Canal não encontrado.');
    return row;
  }

  private async assertCardExists(id: string) {
    const row = await this.prisma.client.crmCard.findUnique({
      where: { id },
      include: { funil: true },
    });
    if (!row) throw new NotFoundException('Card não encontrado.');
    return row;
  }
}
