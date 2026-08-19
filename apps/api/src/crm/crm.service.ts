import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PermissionsService } from '../common/permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateCrmCardDto } from './dto/create-crm-card.dto';
import type { CreateCrmChannelDto } from './dto/create-crm-channel.dto';
import type { CreateCrmFunilDto } from './dto/create-crm-funil.dto';
import type { CreateCrmMotivoPerdaDto } from './dto/create-crm-motivo-perda.dto';
import type { CreateCrmStatusDto } from './dto/create-crm-status.dto';
import type { CrmDashboardQueryDto } from './dto/crm-dashboard-query.dto';
import type { CrmRelatoriosQueryDto } from './dto/crm-relatorios-query.dto';
import type { ImportCrmLeadsDto, UpsertCrmMetaDto } from './dto/crm-meta.dto';
import type { UpdateCrmCardDto } from './dto/update-crm-card.dto';
import type { UpdateCrmChannelDto } from './dto/update-crm-channel.dto';
import type { UpdateCrmFunilDto } from './dto/update-crm-funil.dto';
import type { UpdateCrmStatusDto } from './dto/update-crm-status.dto';
import type { UpsertCrmTouchpointsDto } from './dto/upsert-crm-touchpoints.dto';
import { CRM_CARD_ORIGINS } from './dto/create-crm-card.dto';
import {
  CRM_REPROVADO_FUNIL_NAME,
  appendFunilHistoryEntry,
  getCrmStatusIdByName,
  getDefaultCrmStatusId,
} from './crm.seed';
import {
  computeCrmLeadScore,
  normalizeCrmEmail,
  normalizeCrmPhone,
} from './crm-score.util';

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

type CrmMotivoPerdaRow = {
  id: string;
  name: string;
  order: number;
  requiresText: boolean;
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
  funilOrigemId?: string | null;
  funilHistory?: unknown;
  statusLegacy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  status: string;
  responsavelId?: string | null;
  motivoPerdaId?: string | null;
  motivoPerdaTexto?: string | null;
  funil?: CrmFunilRow;
  funilOrigem?: CrmFunilRow | null;
  responsavel?: { id: string; name: string; email: string } | null;
  motivoPerda?: CrmMotivoPerdaRow | null;
  touchpointRecords?: CrmTouchpointRow[];
};

@Injectable()
export class CrmService {
  private readonly cardInclude = {
    funil: true,
    funilOrigem: true,
    touchpointRecords: { orderBy: { number: 'asc' as const } },
    responsavel: { select: { id: true, name: true, email: true } },
    motivoPerda: true,
  } satisfies Prisma.CrmCardInclude;

  /** Include enxuto do board — só últimos touchpoints feitos (score / last contact). */
  private readonly boardCardInclude = {
    funil: true,
    funilOrigem: true,
    touchpointRecords: {
      where: { done: true },
      orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }],
      take: 5,
    },
    responsavel: { select: { id: true, name: true, email: true } },
    motivoPerda: true,
  } satisfies Prisma.CrmCardInclude;

  /** Máximo de cards por coluna do kanban (evita dump ilimitado). */
  private static readonly BOARD_CARDS_PER_COLUMN = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly permissions: PermissionsService,
  ) {}

  private async leadVisibilityWhere(
    user: AuthUser,
  ): Promise<Prisma.CrmCardWhereInput> {
    const seeAll = await this.permissions.canSeeAllCrmLeads(user);
    if (seeAll) return {};
    return { responsavelId: user.id };
  }

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

  private resolveLastTouchpointAt(
    touchpoints: CrmTouchpointRow[] | undefined,
    fallbackAt?: Date,
  ): string | null {
    const done = (touchpoints ?? []).filter((tp) => tp.done);
    if (done.length === 0) {
      return fallbackAt ? fallbackAt.toISOString() : null;
    }

    const latest = done.reduce((acc, tp) => {
      const at = tp.date ?? tp.createdAt;
      return at.getTime() > acc.getTime() ? at : acc;
    }, done[0]!.date ?? done[0]!.createdAt);

    return latest.toISOString();
  }

  private serializeMotivoPerda(row: CrmMotivoPerdaRow) {
    return {
      id: row.id,
      name: row.name,
      order: row.order,
      requiresText: row.requiresText,
    };
  }

  private serializeCard(
    row: CrmCardRow,
    statusMap?: Map<string, CrmStatusRow>,
  ) {
    const statusMeta = statusMap?.get(row.status);
    const lastTouchpointAt = this.resolveLastTouchpointAt(row.touchpointRecords);
    const score = computeCrmLeadScore({
      phone: row.phone,
      email: row.email,
      value: row.value,
      touchPoints: row.touchPoints,
      lastTouchpointAt: lastTouchpointAt ?? row.updatedAt,
    });
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
      funilOrigemId: row.funilOrigemId ?? null,
      funilOrigem: row.funilOrigem
        ? this.serializeFunil(row.funilOrigem)
        : undefined,
      funilHistory: Array.isArray(row.funilHistory) ? row.funilHistory : [],
      statusLegacy: row.statusLegacy ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      status: row.status,
      statusMeta: statusMeta ? this.serializeStatus(statusMeta) : undefined,
      responsavelId: row.responsavelId ?? null,
      responsavel: row.responsavel
        ? {
            id: row.responsavel.id,
            name: row.responsavel.name,
            email: row.responsavel.email,
          }
        : null,
      motivoPerdaId: row.motivoPerdaId ?? null,
      motivoPerdaTexto: row.motivoPerdaTexto ?? null,
      motivoPerdaMeta: row.motivoPerda
        ? this.serializeMotivoPerda(row.motivoPerda)
        : undefined,
      touchpoints: row.touchpointRecords
        ? row.touchpointRecords
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((tp) => this.serializeTouchpoint(tp))
        : undefined,
      lastTouchpointAt: lastTouchpointAt ?? undefined,
      score,
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

  private async ensureReprovadoFunil() {
    const existing = await this.prisma.client.crmFunil.findFirst({
      where: { name: CRM_REPROVADO_FUNIL_NAME },
    });
    if (existing) return existing;
    const max = await this.prisma.client.crmFunil.aggregate({
      _max: { order: true },
    });
    return this.prisma.client.crmFunil.create({
      data: {
        name: CRM_REPROVADO_FUNIL_NAME,
        order: (max._max.order ?? -1) + 1,
        color: '#71717a',
      },
    });
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

  async listMotivosPerda() {
    const rows = await this.prisma.client.crmMotivoPerda.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => this.serializeMotivoPerda(r));
  }

  async createMotivoPerda(dto: CreateCrmMotivoPerdaDto) {
    let order = dto.order;
    if (order === undefined) {
      const max = await this.prisma.client.crmMotivoPerda.aggregate({
        _max: { order: true },
      });
      order = (max._max.order ?? -1) + 1;
    }

    const created = await this.prisma.client.crmMotivoPerda.create({
      data: {
        name: dto.name.trim(),
        order,
        requiresText: dto.requiresText ?? false,
      },
    });
    return this.serializeMotivoPerda(created);
  }

  async deleteMotivoPerda(id: string) {
    await this.assertMotivoPerdaExists(id);
    const cardCount = await this.prisma.client.crmCard.count({
      where: { motivoPerdaId: id },
    });
    if (cardCount > 0) {
      throw new BadRequestException(
        'Existem leads com este motivo de perda. Não é possível excluir.',
      );
    }
    await this.prisma.client.crmMotivoPerda.delete({ where: { id } });
    return { ok: true };
  }

  private async assertMotivoPerdaExists(id: string) {
    const row = await this.prisma.client.crmMotivoPerda.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Motivo de perda não encontrado.');
    return row;
  }

  private buildMotivosPerdaDistribuicao(
    cards: Array<
      CrmCardRow & {
        motivoPerda?: CrmMotivoPerdaRow | null;
      }
    >,
    isPerdido: (status: string) => boolean,
  ) {
    const map = new Map<string, { motivoId: string; motivoName: string; count: number }>();
    for (const card of cards) {
      if (!isPerdido(card.status) || !card.motivoPerdaId) continue;
      const name = card.motivoPerda?.name ?? 'Sem motivo';
      const current = map.get(card.motivoPerdaId) ?? {
        motivoId: card.motivoPerdaId,
        motivoName: name,
        count: 0,
      };
      current.count += 1;
      map.set(card.motivoPerdaId, current);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  async checkDuplicateCard(phone?: string, email?: string, excludeId?: string) {
    const similar = await this.findSimilarCard(phone, email, excludeId);
    if (!similar) return { duplicate: false as const };
    const statusMap = await this.loadStatusMap();
    return {
      duplicate: true as const,
      existing: this.serializeCard(similar, statusMap),
    };
  }

  private async findSimilarCard(
    phone?: string | null,
    email?: string | null,
    excludeId?: string,
  ): Promise<CrmCardRow | null> {
    const normPhone = normalizeCrmPhone(phone);
    const normEmail = normalizeCrmEmail(email);
    if (!normPhone && !normEmail) return null;

    const candidates = await this.prisma.client.crmCard.findMany({
      where: {
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
        OR: [
          ...(normPhone ? [{ phone: { not: null } }] : []),
          ...(normEmail ? [{ email: { not: null } }] : []),
        ],
      },
      include: this.cardInclude,
      take: 500,
      orderBy: { updatedAt: 'desc' },
    });

    for (const candidate of candidates) {
      if (normPhone && normalizeCrmPhone(candidate.phone) === normPhone) {
        return candidate;
      }
      if (normEmail && normalizeCrmEmail(candidate.email) === normEmail) {
        return candidate;
      }
    }
    return null;
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

  async listCards(user: AuthUser) {
    const visibility = await this.leadVisibilityWhere(user);
    const [funis, statusMap] = await Promise.all([
      this.prisma.client.crmFunil.findMany({
        orderBy: { order: 'asc' },
        select: { id: true },
      }),
      this.loadStatusMap(),
    ]);

    const perColumn = CrmService.BOARD_CARDS_PER_COLUMN;
    const columns = await Promise.all(
      funis.map((funil) =>
        this.prisma.client.crmCard.findMany({
          where: { funilId: funil.id, ...visibility },
          include: this.boardCardInclude,
          orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          take: perColumn,
        }),
      ),
    );

    return columns.flat().map((r) => this.serializeCard(r, statusMap));
  }

  async getCard(id: string, user: AuthUser) {
    const visibility = await this.leadVisibilityWhere(user);
    return this.loadSerializedCard(id, visibility);
  }

  private async loadSerializedCard(
    id: string,
    visibility: Prisma.CrmCardWhereInput = {},
  ) {
    const row = await this.prisma.client.crmCard.findFirst({
      where: { id, ...visibility },
      include: this.cardInclude,
    });
    if (!row) throw new NotFoundException('Card não encontrado.');
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(row, statusMap);
  }

  async createCard(dto: CreateCrmCardDto, userId?: string) {
    await this.assertFunilExists(dto.funilId);

    if (!dto.force) {
      const similar = await this.findSimilarCard(dto.phone, dto.email);
      if (similar) {
        const statusMap = await this.loadStatusMap();
        throw new ConflictException({
          duplicate: true,
          existing: this.serializeCard(similar, statusMap),
        });
      }
    }

    const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
    const funil = await this.assertFunilExists(dto.funilId);
    const createdAt = dto.createdAt ? new Date(dto.createdAt) : new Date();
    if (Number.isNaN(createdAt.getTime())) {
      throw new BadRequestException('Data de criação inválida.');
    }
    const responsavelId = dto.responsavelId?.trim() || userId || null;
    if (responsavelId) {
      await this.assertUserExists(responsavelId);
    }
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
        createdAt,
        funilId: dto.funilId,
        status: defaultStatusId,
        responsavelId,
        funilHistory: [
          {
            funilId: funil.id,
            funilName: funil.name,
            at: createdAt.toISOString(),
            reason: 'created',
          },
        ],
      },
      include: this.cardInclude,
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
    if (dto.createdAt !== undefined) {
      const nextCreated = new Date(dto.createdAt);
      if (Number.isNaN(nextCreated.getTime())) {
        throw new BadRequestException('Data de criação inválida.');
      }
      // Persiste exatamente a data informada (migração / ajuste manual).
      data.createdAt = nextCreated;
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
        data.motivoPerda = { disconnect: true };
        data.motivoPerdaTexto = null;
      }
    }

    const reprovadoFunil = await this.ensureReprovadoFunil();
    const pagoFunil = await this.prisma.client.crmFunil.findFirst({
      where: { name: 'Orçamento Pago' },
    });
    const movingToReprovado =
      (dto.funilId !== undefined && dto.funilId === reprovadoFunil.id) ||
      (dto.status !== undefined && dto.status === perdidoId);
    const leavingReprovado =
      before.funilId === reprovadoFunil.id &&
      dto.funilId !== undefined &&
      dto.funilId !== reprovadoFunil.id;
    const movingToPago =
      dto.funilId !== undefined &&
      pagoFunil != null &&
      dto.funilId === pagoFunil.id;
    const leavingPago =
      pagoFunil != null &&
      before.funilId === pagoFunil.id &&
      dto.funilId !== undefined &&
      dto.funilId !== pagoFunil.id;

    if (movingToReprovado) {
      if (before.funilId !== reprovadoFunil.id) {
        data.funilOrigem = {
          connect: { id: before.funilOrigemId ?? before.funilId },
        };
        data.funil = { connect: { id: reprovadoFunil.id } };
      }
      data.closedAt = new Date();
      if (perdidoId) {
        data.status = perdidoId;
      }
    }

    if (movingToPago) {
      data.closedAt = new Date();
      if (fechadoId) {
        data.status = fechadoId;
      }
    }

    if (leavingReprovado) {
      data.funilOrigem = { disconnect: true };
      if (dto.status === undefined || (dto.status !== perdidoId && dto.status !== fechadoId)) {
        data.closedAt = null;
      }
      if (dto.status !== undefined && dto.status !== perdidoId) {
        data.motivoPerda = { disconnect: true };
        data.motivoPerdaTexto = null;
      }
    }

    if (leavingPago && !movingToReprovado) {
      if (before.status === fechadoId) {
        data.closedAt = null;
        if (dto.status === undefined || dto.status === fechadoId) {
          const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
          data.status = defaultStatusId;
        }
      } else if (dto.status === undefined || dto.status !== perdidoId) {
        data.closedAt = null;
      }
    }

    const nextFunilId =
      movingToReprovado && before.funilId !== reprovadoFunil.id
        ? reprovadoFunil.id
        : dto.funilId !== undefined
          ? dto.funilId
          : before.funilId;
    if (nextFunilId !== before.funilId) {
      const targetFunil =
        nextFunilId === reprovadoFunil.id
          ? reprovadoFunil
          : await this.assertFunilExists(nextFunilId);
      data.funilHistory = appendFunilHistoryEntry(before.funilHistory, {
        funilId: targetFunil.id,
        funilName: targetFunil.name,
        at: new Date().toISOString(),
        fromFunilId: before.funilId,
        fromFunilName: before.funil?.name ?? null,
        reason: movingToReprovado ? 'marcado_perdido' : 'update',
      });
    }

    const markingPerdido = movingToReprovado;
    const alreadyPerdido =
      before.status === perdidoId || before.funilId === reprovadoFunil.id;
    const willBePerdido =
      markingPerdido ||
      (alreadyPerdido && !leavingReprovado && dto.status === undefined);

    if (markingPerdido || (willBePerdido && dto.motivoPerdaId !== undefined)) {
      const motivoId =
        dto.motivoPerdaId !== undefined
          ? dto.motivoPerdaId
          : before.motivoPerdaId;
      if (markingPerdido && !motivoId) {
        throw new BadRequestException(
          'Selecione o motivo de perda antes de marcar como perdido.',
        );
      }
      if (motivoId) {
        const motivo = await this.assertMotivoPerdaExists(motivoId);
        const text =
          dto.motivoPerdaTexto !== undefined
            ? dto.motivoPerdaTexto?.trim() || null
            : before.motivoPerdaTexto ?? null;
        if (motivo.requiresText && !text) {
          throw new BadRequestException('Descreva o motivo de perda.');
        }
        data.motivoPerda = { connect: { id: motivoId } };
        data.motivoPerdaTexto = text;
      }
    } else if (dto.motivoPerdaId !== undefined) {
      if (dto.motivoPerdaId) {
        const motivo = await this.assertMotivoPerdaExists(dto.motivoPerdaId);
        const text = dto.motivoPerdaTexto?.trim() || null;
        if (motivo.requiresText && !text) {
          throw new BadRequestException('Descreva o motivo de perda.');
        }
        data.motivoPerda = { connect: { id: dto.motivoPerdaId } };
        data.motivoPerdaTexto = text;
      } else {
        data.motivoPerda = { disconnect: true };
        data.motivoPerdaTexto = null;
      }
    } else if (dto.motivoPerdaTexto !== undefined) {
      data.motivoPerdaTexto = dto.motivoPerdaTexto?.trim() || null;
    }

    if (dto.responsavelId !== undefined) {
      if (dto.responsavelId) {
        await this.assertUserExists(dto.responsavelId);
        data.responsavel = { connect: { id: dto.responsavelId } };
      } else {
        data.responsavel = { disconnect: true };
      }
    }

    const updated = await this.prisma.client.crmCard.update({
      where: { id },
      data,
      include: this.cardInclude,
    });

    if (
      dto.responsavelId &&
      dto.responsavelId !== before.responsavelId
    ) {
      void this.notifications.create(
        dto.responsavelId,
        'Lead atribuído a você',
        `O lead "${updated.name}" foi atribuído a você.`,
        NOTIFICATION_TYPES.CRM_LEAD_ASSIGNED,
        '/app/crm',
        {
          entityId: updated.id,
          entityType: 'crm_card',
          priority: NOTIFICATION_PRIORITY.NORMAL,
        },
      );
    }

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

    return this.loadSerializedCard(id);
  }

  async deleteCard(id: string) {
    await this.assertCardExists(id);
    await this.prisma.client.crmCard.delete({ where: { id } });
    return { ok: true };
  }

  async moveCard(id: string, funilId: string) {
    const before = await this.assertCardExists(id);
    const target = await this.assertFunilExists(funilId);
    if (before.funilId === funilId) {
      const statusMap = await this.loadStatusMap();
      const full = await this.prisma.client.crmCard.findUnique({
        where: { id },
        include: this.cardInclude,
      });
      if (!full) throw new NotFoundException('Card não encontrado.');
      return this.serializeCard(full, statusMap);
    }

    const { fechadoId, perdidoId } = await this.resolveClosedStatusIds();
    const reprovadoFunil = await this.ensureReprovadoFunil();
    const pagoFunil = await this.prisma.client.crmFunil.findFirst({
      where: { name: 'Orçamento Pago' },
    });
    const history = appendFunilHistoryEntry(before.funilHistory, {
      funilId: target.id,
      funilName: target.name,
      at: new Date().toISOString(),
      fromFunilId: before.funilId,
      fromFunilName: before.funil?.name ?? null,
      reason: 'kanban_move',
    });

    const data: Prisma.CrmCardUpdateInput = {
      funil: { connect: { id: funilId } },
      funilHistory: history,
    };

    if (funilId === reprovadoFunil.id) {
      data.funilOrigem = {
        connect: { id: before.funilOrigemId ?? before.funilId },
      };
      data.closedAt = new Date();
      if (perdidoId) data.status = perdidoId;
    } else if (pagoFunil && funilId === pagoFunil.id) {
      data.closedAt = new Date();
      if (fechadoId) data.status = fechadoId;
    } else if (before.funilId === reprovadoFunil.id) {
      data.funilOrigem = { disconnect: true };
      if (before.status === perdidoId) {
        data.closedAt = null;
        data.motivoPerda = { disconnect: true };
        data.motivoPerdaTexto = null;
        const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
        data.status = defaultStatusId;
      } else if (before.status !== fechadoId) {
        data.closedAt = null;
      }
    } else if (pagoFunil && before.funilId === pagoFunil.id) {
      if (before.status === fechadoId) {
        data.closedAt = null;
        const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
        data.status = defaultStatusId;
      } else if (before.status !== perdidoId) {
        data.closedAt = null;
      }
    }

    const updated = await this.prisma.client.crmCard.update({
      where: { id },
      data,
      include: this.cardInclude,
    });
    const statusMap = await this.loadStatusMap();
    return this.serializeCard(updated, statusMap);
  }

  private resolveDashboardRange(query: CrmDashboardQueryDto): {
    start?: Date;
    end?: Date;
    period: string;
    label: string;
  } {
    const period = query.period ?? 'month';
    const now = new Date();
    const endOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(23, 59, 59, 999);
      return x;
    };
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const fmt = (d: Date) =>
      d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

    if (
      (period === 'custom' || query.startDate || query.endDate) &&
      query.startDate &&
      query.endDate
    ) {
      const start = startOfDay(new Date(`${query.startDate}T00:00:00`));
      const end = endOfDay(new Date(`${query.endDate}T00:00:00`));
      return {
        start,
        end,
        period: 'custom',
        label: `${fmt(start)} a ${fmt(end)}`,
      };
    }

    if (period === 'all') {
      return { period: 'all', label: 'Todo o período' };
    }

    if (period === 'hoje') {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return { start, end, period, label: fmt(start) };
    }

    if (period === 'month') {
      const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = endOfDay(now);
      return { start, end, period, label: `${fmt(start)} a ${fmt(end)}` };
    }

    if (period === 'prev_month') {
      const start = startOfDay(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
      );
      const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
      return { start, end, period, label: `${fmt(start)} a ${fmt(end)}` };
    }

    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const start = startOfDay(new Date(now.getFullYear(), q * 3, 1));
      const end = endOfDay(now);
      return { start, end, period, label: `${fmt(start)} a ${fmt(end)}` };
    }

    if (period === 'year') {
      const start = startOfDay(new Date(now.getFullYear(), 0, 1));
      const end = endOfDay(now);
      return { start, end, period, label: `${fmt(start)} a ${fmt(end)}` };
    }

    const days =
      period === '7d' ? 7 : period === '90d' ? 90 : 30; /* 30d default */
    const start = startOfDay(
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    );
    const end = endOfDay(now);
    return { start, end, period, label: `${fmt(start)} a ${fmt(end)}` };
  }

  private createdAtRangeFilter(start?: Date, end?: Date): Prisma.DateTimeFilter | undefined {
    if (!start && !end) return undefined;
    return {
      ...(start ? { gte: start } : {}),
      ...(end ? { lte: end } : {}),
    };
  }

  async getDashboard(query: CrmDashboardQueryDto, user: AuthUser) {
    const originFilter =
      query.origin && query.origin !== 'TODOS' ? query.origin : undefined;
    const range = this.resolveDashboardRange(query);
    const createdAt = this.createdAtRangeFilter(range.start, range.end);
    const visibility = await this.leadVisibilityWhere(user);

    const where: Prisma.CrmCardWhereInput = {
      ...visibility,
      ...(originFilter ? { origin: originFilter } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [funis, statusMap, { fechadoId, perdidoId }, leads, touchAgg] =
      await Promise.all([
        this.prisma.client.crmFunil.findMany({
          orderBy: { order: 'asc' },
          select: { id: true, name: true },
        }),
        this.loadStatusMap(),
        this.resolveClosedStatusIds(),
        this.prisma.client.crmCard.count({ where }),
        this.prisma.client.crmCard.aggregate({
          where,
          _avg: { touchPoints: true },
        }),
      ]);

    const orcamentoFunilIds = funis
      .filter((f) => this.isOrcamentoFunilName(f.name))
      .map((f) => f.id);

    const fechadoWhere: Prisma.CrmCardWhereInput = {
      ...where,
      ...(fechadoId
        ? { status: fechadoId }
        : {
            status: {
              in: [...statusMap.values()]
                .filter((s) => s.name === 'Fechado')
                .map((s) => s.id),
            },
          }),
    };

    const perdidoWhere: Prisma.CrmCardWhereInput = {
      ...where,
      ...(perdidoId
        ? { status: perdidoId }
        : {
            status: {
              in: [...statusMap.values()]
                .filter((s) => s.name === 'Perdido')
                .map((s) => s.id),
            },
          }),
    };

    const orcamentoWhere: Prisma.CrmCardWhereInput = {
      ...where,
      OR: [
        ...(orcamentoFunilIds.length > 0
          ? [{ funilId: { in: orcamentoFunilIds } }]
          : []),
        { value: { gt: 0 } },
      ],
    };

    const openStatusFilter: Prisma.CrmCardWhereInput =
      fechadoId || perdidoId
        ? {
            status: {
              notIn: [fechadoId, perdidoId].filter(Boolean) as string[],
            },
          }
        : {};

    const quoteWhere: Prisma.QuoteWhereInput = {
      ...(createdAt
        ? { OR: [{ createdAt }, { requestDate: createdAt }] }
        : {}),
    };

    const propostaWhere: Prisma.CrmPropostaWhereInput = {
      ...(createdAt ? { createdAt } : {}),
      ...(originFilter
        ? { card: { origin: originFilter } }
        : {}),
    };

    const quoteProposalWhere: Prisma.QuoteProposalWhereInput = {
      ...(createdAt ? { createdAt } : {}),
    };

    const [
      fechados,
      valorFechadoAgg,
      orcamentos,
      fechadosSlim,
      motivosGroup,
      openSlim,
      valorOrcamentosAgg,
      qtdCrmPropostas,
      qtdQuotePropostas,
      valorOrcamentosCardsAgg,
      emAndamentoAgg,
      emAndamentoCount,
      vendedorGroups,
      cardsParaAtencao,
      propostasHojeCrm,
      propostasHojeQuote,
      fechadosHoje,
    ] = await Promise.all([
      this.prisma.client.crmCard.count({ where: fechadoWhere }),
      this.prisma.client.crmCard.aggregate({
        where: fechadoWhere,
        _sum: { value: true },
      }),
      this.prisma.client.crmCard.count({ where: orcamentoWhere }),
      this.prisma.client.crmCard.findMany({
        where: fechadoWhere,
        select: { createdAt: true, closedAt: true },
      }),
      this.prisma.client.crmCard.groupBy({
        by: ['motivoPerdaId'],
        where: {
          ...perdidoWhere,
          motivoPerdaId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.client.crmCard.findMany({
        where: {
          ...where,
          ...openStatusFilter,
        },
        select: {
          id: true,
          createdAt: true,
          status: true,
          touchpointRecords: {
            where: { done: true },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { date: true, createdAt: true, done: true },
          },
        },
      }),
      this.prisma.client.quote.aggregate({
        where: quoteWhere,
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.client.crmProposta.count({ where: propostaWhere }),
      this.prisma.client.quoteProposal.count({ where: quoteProposalWhere }),
      this.prisma.client.crmCard.aggregate({
        where: orcamentoWhere,
        _sum: { value: true },
      }),
      this.prisma.client.crmCard.aggregate({
        where: { ...where, ...openStatusFilter },
        _sum: { value: true },
      }),
      this.prisma.client.crmCard.count({
        where: { ...where, ...openStatusFilter },
      }),
      this.prisma.client.crmCard.groupBy({
        by: ['responsavelId'],
        where,
        _count: { _all: true },
        _sum: { value: true },
      }),
      this.prisma.client.crmCard.findMany({
        where: {
          ...where,
          ...openStatusFilter,
        },
        select: {
          id: true,
          createdAt: true,
          value: true,
          responsavelId: true,
          responsavel: { select: { id: true, name: true } },
          propostas: { select: { id: true }, take: 1 },
        },
      }),
      this.prisma.client.crmProposta.count({
        where: {
          createdAt: {
            gte: (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })(),
          },
        },
      }),
      this.prisma.client.quoteProposal.count({
        where: {
          createdAt: {
            gte: (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })(),
          },
        },
      }),
      this.prisma.client.crmCard.count({
        where: {
          ...fechadoWhere,
          closedAt: {
            gte: (() => {
              const d = new Date();
              d.setHours(0, 0, 0, 0);
              return d;
            })(),
          },
        },
      }),
    ]);

    const valorFechado = Number(valorFechadoAgg._sum.value ?? 0);
    const ticketMedio = fechados > 0 ? valorFechado / fechados : 0;
    const taxaLeadOrcamento = leads > 0 ? (orcamentos / leads) * 100 : 0;
    const taxaLeadFechado = leads > 0 ? (fechados / leads) * 100 : 0;
    const taxaOrcamentoFechado =
      orcamentos > 0 ? (fechados / orcamentos) * 100 : 0;

    const ciclosDias = fechadosSlim
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

    const touchpointsMedios = touchAgg._avg.touchPoints ?? 0;

    const porOrigem = await Promise.all(
      CRM_CARD_ORIGINS.map(async (origin) => {
        const oWhere: Prisma.CrmCardWhereInput = { ...where, origin };
        const oFechado: Prisma.CrmCardWhereInput = {
          ...fechadoWhere,
          origin,
        };
        const oOrc: Prisma.CrmCardWhereInput = {
          ...orcamentoWhere,
          origin,
        };

        const [
          subsetLeads,
          subsetFechados,
          subsetValor,
          subsetOrcamentos,
          subsetCicloRows,
          subsetTouch,
        ] = await Promise.all([
          this.prisma.client.crmCard.count({ where: oWhere }),
          this.prisma.client.crmCard.count({ where: oFechado }),
          this.prisma.client.crmCard.aggregate({
            where: oFechado,
            _sum: { value: true },
          }),
          this.prisma.client.crmCard.count({ where: oOrc }),
          this.prisma.client.crmCard.findMany({
            where: oFechado,
            select: { createdAt: true, closedAt: true },
          }),
          this.prisma.client.crmCard.aggregate({
            where: oWhere,
            _avg: { touchPoints: true },
          }),
        ]);

        const subsetValorFechado = Number(subsetValor._sum.value ?? 0);
        const subsetCiclos = subsetCicloRows
          .filter((c) => c.closedAt)
          .map(
            (c) =>
              (c.closedAt!.getTime() - c.createdAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );

        return {
          origin,
          leads: subsetLeads,
          orcamentos: subsetOrcamentos,
          fechados: subsetFechados,
          taxaLeadFechado:
            subsetLeads > 0 ? (subsetFechados / subsetLeads) * 100 : 0,
          ticketMedio:
            subsetFechados > 0 ? subsetValorFechado / subsetFechados : 0,
          cicloMedioDias:
            subsetCiclos.length > 0
              ? subsetCiclos.reduce((a, b) => a + b, 0) / subsetCiclos.length
              : 0,
          touchpointsMedios: subsetTouch._avg.touchPoints ?? 0,
        };
      }),
    );

    const cutoffMs = 3 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const leadsSemContato = openSlim.filter((card) => {
      if (this.isClosedStatus(card.status, statusMap, fechadoId, perdidoId)) {
        return false;
      }
      const tp = card.touchpointRecords[0];
      const last = tp ? (tp.date ?? tp.createdAt) : card.createdAt;
      return now - last.getTime() > cutoffMs;
    }).length;

    const motivoIds = motivosGroup
      .map((g) => g.motivoPerdaId)
      .filter((id): id is string => Boolean(id));
    const motivosRows =
      motivoIds.length > 0
        ? await this.prisma.client.crmMotivoPerda.findMany({
            where: { id: { in: motivoIds } },
            select: { id: true, name: true },
          })
        : [];
    const motivoNameById = new Map(motivosRows.map((m) => [m.id, m.name]));
    const motivosPerdaDistribuicao = motivosGroup
      .filter((g) => g.motivoPerdaId)
      .map((g) => ({
        motivoId: g.motivoPerdaId!,
        motivoName: motivoNameById.get(g.motivoPerdaId!) ?? 'Sem motivo',
        count: g._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const nowDate = new Date();
    const metasMes = await this.buildMetasMesProgress(
      nowDate.getMonth() + 1,
      nowDate.getFullYear(),
    );

    const valorQuotes = Number(valorOrcamentosAgg._sum.total ?? 0);
    const valorCardsOrc = Number(valorOrcamentosCardsAgg._sum.value ?? 0);
    const valorOrcamentos = valorQuotes > 0 ? valorQuotes : valorCardsOrc;
    const qtdPropostas = qtdCrmPropostas + qtdQuotePropostas;

    const vendedorIds = vendedorGroups
      .map((g) => g.responsavelId)
      .filter((id): id is string => Boolean(id));
    const vendedorUsers =
      vendedorIds.length > 0
        ? await this.prisma.client.user.findMany({
            where: { id: { in: vendedorIds } },
            select: { id: true, name: true },
          })
        : [];
    const vendedorName = new Map(vendedorUsers.map((u) => [u.id, u.name]));

    const fechadosPorVendedor = await Promise.all(
      vendedorGroups.map(async (g) => {
        const responsavelId = g.responsavelId;
        const fechadosV = await this.prisma.client.crmCard.count({
          where: {
            ...fechadoWhere,
            responsavelId: responsavelId ?? null,
          },
        });
        const valorV = await this.prisma.client.crmCard.aggregate({
          where: {
            ...fechadoWhere,
            responsavelId: responsavelId ?? null,
          },
          _sum: { value: true },
        });
        const leadsV = g._count._all;
        const valorFechadoV = Number(valorV._sum.value ?? 0);
        return {
          responsavelId: responsavelId ?? null,
          nome: responsavelId
            ? (vendedorName.get(responsavelId) ?? 'Vendedor')
            : 'Sem responsável',
          leads: leadsV,
          fechados: fechadosV,
          valorFechado: valorFechadoV,
          taxaConversao: leadsV > 0 ? (fechadosV / leadsV) * 100 : 0,
        };
      }),
    );
    const porVendedor = fechadosPorVendedor.sort(
      (a, b) => b.valorFechado - a.valorFechado || b.fechados - a.fechados,
    );

    const semProposta = cardsParaAtencao.filter((c) => c.propostas.length === 0);
    const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
    const semProposta48h = semProposta.filter(
      (c) => c.createdAt.getTime() < cutoff48h,
    );
    const filaPorVendedor = new Map<
      string,
      { nome: string; count: number }
    >();
    for (const c of semProposta) {
      const key = c.responsavelId ?? '__none__';
      const nome = c.responsavel?.name ?? 'Sem responsável';
      const prev = filaPorVendedor.get(key);
      if (prev) prev.count += 1;
      else filaPorVendedor.set(key, { nome, count: 1 });
    }
    const maiorFila = [...filaPorVendedor.values()].sort(
      (a, b) => b.count - a.count,
    )[0];

    const funilBase = Math.max(orcamentos, 1);
    const orcComProposta = await this.prisma.client.crmCard.count({
      where: {
        ...orcamentoWhere,
        propostas: { some: {} },
      },
    });

    const funil = [
      {
        id: 'orcamentos',
        label: 'Orçamentos / oportunidades',
        count: orcamentos,
        valor: valorOrcamentos,
        percent: 100,
        hint: `${orcamentos} registros`,
      },
      {
        id: 'propostas',
        label: 'Com proposta gerada',
        count: orcComProposta,
        valor: null as number | null,
        percent: (orcComProposta / funilBase) * 100,
        hint: `${qtdPropostas} proposta(s) no período`,
      },
      {
        id: 'fechados',
        label: 'Pedidos / vendas fechadas',
        count: fechados,
        valor: valorFechado,
        percent: taxaOrcamentoFechado,
        hint: `${fechados} registros`,
      },
    ];

    return {
      filter: originFilter ?? 'TODOS',
      period: range.period,
      periodLabel: range.label,
      startDate: range.start?.toISOString() ?? null,
      endDate: range.end?.toISOString() ?? null,
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
        leadsSemContato,
      },
      porOrigem,
      motivosPerdaDistribuicao,
      metasMes,
      completo: {
        valorOrcamentos,
        qtdOrcamentos: Math.max(
          valorOrcamentosAgg._count._all,
          orcamentos,
        ),
        qtdPropostas,
        taxaConversao: taxaOrcamentoFechado,
        ticketMedio,
        tempoMedioDias: cicloMedioDias,
        tempoMedioHoras: cicloMedioDias * 24,
        emAndamento: {
          count: emAndamentoCount,
          valor: Number(emAndamentoAgg._sum.value ?? 0),
        },
        porVendedor,
        funil,
        atencao: {
          orcamentosSemProposta48h: semProposta48h.length,
          orcamentosSemProposta: semProposta.length,
          propostasGeradasHoje: propostasHojeCrm + propostasHojeQuote,
          fechadosHoje,
          maiorFilaSemProposta: maiorFila
            ? { nome: maiorFila.nome, count: maiorFila.count }
            : null,
        },
      },
    };
  }

  async getRelatorios(query: CrmRelatoriosQueryDto, user: AuthUser) {
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Datas inválidas.');
    }
    if (start > end) {
      throw new BadRequestException('Data inicial deve ser anterior à final.');
    }

    const originFilter =
      query.origin && query.origin !== 'TODOS' ? query.origin : undefined;
    const visibility = await this.leadVisibilityWhere(user);

    const where: Prisma.CrmCardWhereInput = {
      ...visibility,
      createdAt: { gte: start, lte: end },
      ...(originFilter ? { origin: originFilter } : {}),
    };

    const [
      cards,
      statuses,
      statusMap,
      channels,
      { fechadoId, perdidoId },
    ] = await Promise.all([
      this.prisma.client.crmCard.findMany({
        where,
        include: {
          funil: true,
          touchpointRecords: { orderBy: { number: 'asc' } },
          motivoPerda: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.crmStatus.findMany({
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      this.loadStatusMap(),
      this.prisma.client.crmChannel.findMany(),
      this.resolveClosedStatusIds(),
    ]);

    const channelMap = new Map(channels.map((c) => [c.id, c.name]));
    const negociacaoStatusId =
      statuses.find((s) => s.name === 'Em Negociação')?.id ?? null;

    const isFechado = (status: string) =>
      this.isFechadoStatus(status, statusMap, fechadoId);
    const isPerdido = (status: string) =>
      status === perdidoId || statusMap.get(status)?.name === 'Perdido';

    const fechadosCards = cards.filter((c) => isFechado(c.status));
    const perdidos = cards.filter((c) => isPerdido(c.status)).length;
    const emNegociacao = negociacaoStatusId
      ? cards.filter((c) => c.status === negociacaoStatusId).length
      : cards.filter(
          (c) =>
            !isFechado(c.status) &&
            !isPerdido(c.status) &&
            statusMap.get(c.status)?.name === 'Em Negociação',
        ).length;

    const valorTotalFechado = fechadosCards.reduce(
      (sum, c) => sum + Number(c.value ?? 0),
      0,
    );
    const totalLeads = cards.length;
    const fechados = fechadosCards.length;
    const ticketMedio = fechados > 0 ? valorTotalFechado / fechados : 0;
    const taxaConversaoGeral =
      totalLeads > 0 ? (fechados / totalLeads) * 100 : 0;

    const resolveCanalEntrada = (touchpoints: CrmTouchpointRow[]) => {
      const withChannel = touchpoints.find((tp) => tp.channel);
      if (!withChannel?.channel) return null;
      return channelMap.get(withChannel.channel) ?? withChannel.channel;
    };

    const leadsFechados = fechadosCards.map((card) => {
      const closedAt = card.closedAt ?? card.updatedAt;
      const cicloVendasDias =
        (closedAt.getTime() - card.createdAt.getTime()) /
        (1000 * 60 * 60 * 24);

      return {
        id: card.id,
        name: card.name,
        origin: card.origin,
        canalEntrada: resolveCanalEntrada(card.touchpointRecords ?? []),
        valor: Number(card.value ?? 0),
        touchpoints: card.touchPoints,
        cicloVendasDias: Math.max(0, cicloVendasDias),
        dataFechamento: closedAt.toISOString(),
      };
    });

    const performancePorOrigem = CRM_CARD_ORIGINS.map((origin) => {
      const subset = cards.filter((c) => c.origin === origin);
      const subsetFechados = subset.filter((c) => isFechado(c.status));
      const subsetValor = subsetFechados.reduce(
        (sum, c) => sum + Number(c.value ?? 0),
        0,
      );
      const subsetCiclos = subsetFechados
        .filter((c) => c.closedAt)
        .map(
          (c) =>
            (c.closedAt!.getTime() - c.createdAt.getTime()) /
            (1000 * 60 * 60 * 24),
        );

      return {
        origin,
        leads: subset.length,
        fechados: subsetFechados.length,
        taxaConversao:
          subset.length > 0
            ? (subsetFechados.length / subset.length) * 100
            : 0,
        ticketMedio:
          subsetFechados.length > 0 ? subsetValor / subsetFechados.length : 0,
        cicloMedioDias:
          subsetCiclos.length > 0
            ? subsetCiclos.reduce((a, b) => a + b, 0) / subsetCiclos.length
            : 0,
        touchpointsMedios:
          subset.length > 0
            ? subset.reduce((s, c) => s + c.touchPoints, 0) / subset.length
            : 0,
      };
    });

    const funis = await this.prisma.client.crmFunil.findMany({
      orderBy: { order: 'asc' },
    });
    const funilCounts = funis.map((funil) => ({
      statusId: funil.id,
      statusName: funil.name,
      order: funil.order,
      count: cards.filter((c) => c.funilId === funil.id).length,
    }));

    const funilConversao = funilCounts.map((row, index) => {
      const previousCount =
        index === 0 ? totalLeads : funilCounts[index - 1]!.count;
      const dropPercent =
        index === 0 || previousCount === 0
          ? null
          : ((previousCount - row.count) / previousCount) * 100;

      return {
        ...row,
        dropPercent,
      };
    });

    const rangeDays =
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    const bucketMode: 'week' | 'month' = rangeDays > 90 ? 'month' : 'week';

    const evolucaoMap = new Map<
      string,
      { period: string; periodStart: string; novosLeads: number; fechamentos: number }
    >();

    const bucketKey = (date: Date) => {
      if (bucketMode === 'month') {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().slice(0, 10);
    };

    const bucketLabel = (key: string) => {
      if (bucketMode === 'month') {
        const [y, m] = key.split('-');
        return `${m}/${y}`;
      }
      const d = new Date(key);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    };

    for (const card of cards) {
      const key = bucketKey(card.createdAt);
      const row = evolucaoMap.get(key) ?? {
        period: bucketLabel(key),
        periodStart: key,
        novosLeads: 0,
        fechamentos: 0,
      };
      row.novosLeads += 1;
      evolucaoMap.set(key, row);
    }

    for (const card of fechadosCards) {
      const closedAt = card.closedAt ?? card.updatedAt;
      if (closedAt < start || closedAt > end) continue;
      const key = bucketKey(closedAt);
      const row = evolucaoMap.get(key) ?? {
        period: bucketLabel(key),
        periodStart: key,
        novosLeads: 0,
        fechamentos: 0,
      };
      row.fechamentos += 1;
      evolucaoMap.set(key, row);
    }

    const evolucaoTemporal = [...evolucaoMap.values()].sort((a, b) =>
      a.periodStart.localeCompare(b.periodStart),
    );

    const motivosPerdaDistribuicao = this.buildMotivosPerdaDistribuicao(
      cards,
      isPerdido,
    );

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      origin: originFilter ?? 'TODOS',
      bucketMode,
      resumo: {
        totalLeads,
        fechados,
        perdidos,
        emNegociacao,
        valorTotalFechado,
        ticketMedio,
        taxaConversaoGeral,
      },
      leadsFechados,
      performancePorOrigem,
      funilConversao,
      evolucaoTemporal,
      motivosPerdaDistribuicao,
    };
  }

  async markCardStatusByName(id: string, statusName: 'Fechado' | 'Perdido') {
    const statusId = await getCrmStatusIdByName(this.prisma.client, statusName);
    if (!statusId) {
      throw new BadRequestException(`Status "${statusName}" não encontrado.`);
    }
    return this.updateCard(id, { status: statusId });
  }

  /**
   * Cria card no funil Orçamentos a partir de orçamento criado sem lead vinculado.
   * Usa status "Orçamento Solicitado" e origem ORCAMENTO_DIRETO.
   */
  async createCardFromDirectQuote(input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    value?: number | null;
    responsavelId?: string | null;
  }): Promise<string> {
    const funis = await this.prisma.client.crmFunil.findMany({
      orderBy: { order: 'asc' },
    });
    const funil =
      funis.find((f) => f.name === 'Orçamento Solicitado') ??
      funis.find((f) => this.isOrcamentoFunilName(f.name)) ??
      funis[0] ??
      null;
    if (!funil) {
      throw new BadRequestException(
        'Nenhum funil CRM configurado. Crie o funil "Orçamento Solicitado" antes de cadastrar orçamentos.',
      );
    }

    const statusId =
      (await getCrmStatusIdByName(this.prisma.client, 'Orçamento Solicitado')) ??
      (await getDefaultCrmStatusId(this.prisma.client));

    const createdAt = new Date();
    const created = await this.prisma.client.crmCard.create({
      data: {
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        value:
          input.value != null && input.value > 0
            ? new Prisma.Decimal(input.value)
            : null,
        origin: 'ORCAMENTO_DIRETO',
        funilId: funil.id,
        status: statusId,
        responsavelId: input.responsavelId?.trim() || null,
        notes: 'Criado automaticamente a partir de orçamento direto.',
        funilHistory: [
          {
            funilId: funil.id,
            funilName: funil.name,
            at: createdAt.toISOString(),
            reason: 'orcamento_direto',
          },
        ],
      },
    });

    return created.id;
  }

  async listUsuarios() {
    return this.prisma.client.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
  }

  async getMeta(mes: number, ano: number) {
    const row = await this.prisma.client.crmMeta.findUnique({
      where: { mes_ano: { mes, ano } },
    });
    if (!row) {
      return {
        mes,
        ano,
        metaLeads: 0,
        metaFechamentos: 0,
        metaValor: 0,
      };
    }
    return {
      mes: row.mes,
      ano: row.ano,
      metaLeads: row.metaLeads,
      metaFechamentos: row.metaFechamentos,
      metaValor: Number(row.metaValor),
    };
  }

  async upsertMeta(dto: UpsertCrmMetaDto) {
    const row = await this.prisma.client.crmMeta.upsert({
      where: { mes_ano: { mes: dto.mes, ano: dto.ano } },
      create: {
        mes: dto.mes,
        ano: dto.ano,
        metaLeads: dto.metaLeads,
        metaFechamentos: dto.metaFechamentos,
        metaValor: new Prisma.Decimal(dto.metaValor),
      },
      update: {
        metaLeads: dto.metaLeads,
        metaFechamentos: dto.metaFechamentos,
        metaValor: new Prisma.Decimal(dto.metaValor),
      },
    });
    return {
      mes: row.mes,
      ano: row.ano,
      metaLeads: row.metaLeads,
      metaFechamentos: row.metaFechamentos,
      metaValor: Number(row.metaValor),
    };
  }

  private async buildMetasMesProgress(mes: number, ano: number) {
    const start = new Date(ano, mes - 1, 1);
    const end = new Date(ano, mes, 0, 23, 59, 59, 999);
    const meta = await this.getMeta(mes, ano);
    const statusMap = await this.loadStatusMap();
    const { fechadoId } = await this.resolveClosedStatusIds();
    const isFechado = (status: string) =>
      this.isFechadoStatus(status, statusMap, fechadoId);

    const fechadosRows = await this.prisma.client.crmCard.findMany({
      where: { closedAt: { gte: start, lte: end } },
      select: { value: true, status: true },
    });

    const leadsNoMes = await this.prisma.client.crmCard.count({
      where: { createdAt: { gte: start, lte: end } },
    });

    const fechadosCards = fechadosRows.filter((c) => isFechado(c.status));
    const atualFechamentos = fechadosCards.length;
    const atualValor = fechadosCards.reduce(
      (sum, c) => sum + Number(c.value ?? 0),
      0,
    );

    const progress = (atual: number, metaValue: number) =>
      metaValue > 0 ? (atual / metaValue) * 100 : 0;

    return {
      mes,
      ano,
      metaLeads: meta.metaLeads,
      metaFechamentos: meta.metaFechamentos,
      metaValor: meta.metaValor,
      atualLeads: leadsNoMes,
      atualFechamentos,
      atualValor,
      progressoLeads: progress(leadsNoMes, meta.metaLeads),
      progressoFechamentos: progress(atualFechamentos, meta.metaFechamentos),
      progressoValor: progress(atualValor, meta.metaValor),
    };
  }

  async importLeads(dto: ImportCrmLeadsDto) {
    if (dto.leads.length === 0) {
      throw new BadRequestException('Nenhum lead para importar.');
    }

    const funil = await this.prisma.client.crmFunil.findFirst({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    if (!funil) {
      throw new BadRequestException('Crie um funil antes de importar leads.');
    }

    const defaultStatusId = await getDefaultCrmStatusId(this.prisma.client);
    const statusMap = await this.loadStatusMap();

    const created = await this.prisma.client.$transaction(
      dto.leads.map((lead) =>
        this.prisma.client.crmCard.create({
          data: {
            name: lead.nome.trim(),
            phone: lead.telefone?.trim() || null,
            email: lead.email?.trim() || null,
            value:
              lead.valor != null && lead.valor > 0
                ? new Prisma.Decimal(lead.valor)
                : null,
            origin: lead.origem,
            observations: lead.observacoes?.trim() || null,
            funilId: funil.id,
            status: defaultStatusId,
          },
          include: {
            funil: true,
            touchpointRecords: true,
            responsavel: { select: { id: true, name: true, email: true } },
          },
        }),
      ),
    );

    return {
      imported: created.length,
      cards: created.map((row) => this.serializeCard(row, statusMap)),
    };
  }

  async listFollowUpOverdueCards(followupDays = 3) {
    const cutoffMs = followupDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const statusMap = await this.loadStatusMap();
    const { fechadoId, perdidoId } = await this.resolveClosedStatusIds();

    const cards = await this.prisma.client.crmCard.findMany({
      include: { touchpointRecords: { orderBy: { number: 'asc' } } },
    });

    return cards.filter((card) => {
      if (
        this.isClosedStatus(card.status, statusMap, fechadoId, perdidoId)
      ) {
        return false;
      }
      const last =
        this.resolveLastTouchpointAt(
          card.touchpointRecords,
          card.createdAt,
        ) ?? card.createdAt;
      return now - new Date(last).getTime() > cutoffMs;
    });
  }

  private async assertUserExists(id: string) {
    const row = await this.prisma.client.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!row || !row.isActive) {
      throw new NotFoundException('Usuário responsável não encontrado.');
    }
    return row;
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

