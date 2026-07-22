import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService['client'];

/** Status legados (ainda usados em filtros/relatórios internos). */
const DEFAULT_STATUSES = [
  { name: 'Novo Lead', color: '#6366f1', order: 0 },
  { name: 'Orçamento Solicitado', color: '#3b82f6', order: 1 },
  { name: 'Em Negociação', color: '#f59e0b', order: 2 },
  { name: 'Cliente não respondeu', color: '#ef4444', order: 3 },
  { name: 'Fechado', color: '#22c55e', order: 4 },
  /** Status interno (oculto no select); perda usa o funil "Orçamento Reprovado". */
  { name: 'Perdido', color: '#71717a', order: 99 },
] as const;

/** Funis-etapa padrão (cada coluna do Kanban). */
export const DEFAULT_CRM_FUNIS = [
  { name: 'Novo Lead', color: '#6366f1', order: 0 },
  { name: 'Orçamento Solicitado', color: '#3b82f6', order: 1 },
  { name: 'Orçamento Enviado', color: '#0ea5e9', order: 2 },
  { name: 'Orçamento Quente', color: '#f59e0b', order: 3 },
  { name: 'Orçamento Aprovado', color: '#84cc16', order: 4 },
  { name: 'Pedido Entregue', color: '#22c55e', order: 5 },
  { name: 'Orçamento Pago', color: '#10b981', order: 6 },
  { name: 'Orçamento Reprovado', color: '#71717a', order: 7 },
] as const;

/** Funil destino do botão "Marcar como Perdido". */
export const CRM_REPROVADO_FUNIL_NAME = 'Orçamento Reprovado';

/** @deprecated use CRM_REPROVADO_FUNIL_NAME */
export const CRM_PERDIDOS_FUNIL_NAME = CRM_REPROVADO_FUNIL_NAME;

const DEFAULT_CHANNELS = [
  { name: 'WhatsApp', color: '#22c55e' },
  { name: 'Ligação', color: '#3b82f6' },
  { name: 'Email', color: '#a855f7' },
  { name: 'Outro', color: '#71717a' },
] as const;

const DEFAULT_MOTIVOS_PERDA = [
  { name: 'Preço', order: 0, requiresText: false },
  { name: 'Concorrência', order: 1, requiresText: false },
  { name: 'Prazo', order: 2, requiresText: false },
  { name: 'Sem resposta', order: 3, requiresText: false },
  { name: 'Produto inadequado', order: 4, requiresText: false },
  { name: 'Outro', order: 5, requiresText: true },
] as const;

const LEGACY_STATUS_CODE_MAP: Record<string, string> = {
  ABERTO: 'Novo Lead',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
  NOVO_LEAD: 'Novo Lead',
};

/** Status antigo (nome) → funil-etapa. */
export const LEGACY_STATUS_TO_FUNIL: Record<string, string> = {
  'Novo Lead': 'Novo Lead',
  'Orçamento Solicitado': 'Orçamento Solicitado',
  'Em Negociação': 'Orçamento Quente',
  'Cliente não respondeu': 'Orçamento Enviado',
  Fechado: 'Orçamento Pago',
  Perdido: 'Orçamento Reprovado',
};

type FunilHistoryEntry = {
  funilId: string;
  funilName: string;
  at: string;
  fromFunilId?: string | null;
  fromFunilName?: string | null;
  statusLegacy?: string | null;
  reason?: string | null;
};

export function parseFunilHistory(raw: unknown): FunilHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is FunilHistoryEntry =>
      Boolean(e) &&
      typeof e === 'object' &&
      typeof (e as FunilHistoryEntry).funilId === 'string' &&
      typeof (e as FunilHistoryEntry).funilName === 'string',
  );
}

export function appendFunilHistoryEntry(
  raw: unknown,
  entry: FunilHistoryEntry,
): FunilHistoryEntry[] {
  const prev = parseFunilHistory(raw);
  const last = prev[prev.length - 1];
  if (last && last.funilId === entry.funilId) return prev;
  return [...prev, entry];
}

export async function ensureDefaultCrmFunis(client: Db) {
  const byName = new Map<string, { id: string; name: string; order: number }>();

  for (const row of DEFAULT_CRM_FUNIS) {
    const existing = await client.crmFunil.findFirst({
      where: { name: row.name },
    });
    if (existing) {
      await client.crmFunil.update({
        where: { id: existing.id },
        data: {
          // Só ajusta cor/ordem se ainda batem com o seed padrão “virgem”
          color: existing.color ?? row.color,
        },
      });
      byName.set(row.name, existing);
    } else {
      const created = await client.crmFunil.create({
        data: {
          name: row.name,
          order: row.order,
          color: row.color,
        },
      });
      byName.set(row.name, created);
    }
  }

  // Renomeia funil legado "Perdidos" → "Orçamento Reprovado" se ainda existir.
  const legacyPerdidos = await client.crmFunil.findFirst({
    where: { name: 'Perdidos' },
  });
  const reprovado = byName.get(CRM_REPROVADO_FUNIL_NAME);
  if (legacyPerdidos && reprovado && legacyPerdidos.id !== reprovado.id) {
    await client.crmCard.updateMany({
      where: { funilId: legacyPerdidos.id },
      data: { funilId: reprovado.id },
    });
    await client.crmCard.updateMany({
      where: { funilOrigemId: legacyPerdidos.id },
      data: { funilOrigemId: reprovado.id },
    });
    const stillUsed = await client.crmCard.count({
      where: {
        OR: [
          { funilId: legacyPerdidos.id },
          { funilOrigemId: legacyPerdidos.id },
        ],
      },
    });
    if (stillUsed === 0) {
      await client.crmFunil.delete({ where: { id: legacyPerdidos.id } });
    }
  } else if (legacyPerdidos && !reprovado) {
    await client.crmFunil.update({
      where: { id: legacyPerdidos.id },
      data: {
        name: CRM_REPROVADO_FUNIL_NAME,
        color: legacyPerdidos.color ?? '#71717a',
      },
    });
    byName.set(CRM_REPROVADO_FUNIL_NAME, {
      id: legacyPerdidos.id,
      name: CRM_REPROVADO_FUNIL_NAME,
      order: legacyPerdidos.order,
    });
  }

  // Reordena os 8 padrão para a ordem canônica (sem tocar funis custom extras).
  for (const row of DEFAULT_CRM_FUNIS) {
    const f = byName.get(row.name);
    if (!f) continue;
    await client.crmFunil.update({
      where: { id: f.id },
      data: { order: row.order },
    });
  }

  // Empurra funis custom (não padrão) para depois dos 8, preservando ordem relativa.
  const defaultNames: Set<string> = new Set(DEFAULT_CRM_FUNIS.map((f) => f.name));
  const extras = await client.crmFunil.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
  const custom = extras.filter((f) => !defaultNames.has(f.name));
  let nextOrder = DEFAULT_CRM_FUNIS.length;
  for (const f of custom) {
    if (f.order !== nextOrder) {
      await client.crmFunil.update({
        where: { id: f.id },
        data: { order: nextOrder },
      });
    }
    nextOrder += 1;
  }

  return byName;
}

/**
 * Migra cards existentes: status antigo → funil-etapa.
 * Preserva statusLegacy e acrescenta entrada em funilHistory.
 */
export async function migrateCrmCardsToStageFunis(client: Db) {
  const funilByName = await ensureDefaultCrmFunis(client);
  const statuses = await client.crmStatus.findMany();
  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const novoLeadStatusId =
    statuses.find((s) => s.name === 'Novo Lead')?.id ?? statuses[0]?.id;
  const perdidoStatus = statuses.find((s) => s.name === 'Perdido');
  const fechadoStatus = statuses.find((s) => s.name === 'Fechado');

  const cards = await client.crmCard.findMany({
    select: {
      id: true,
      status: true,
      statusLegacy: true,
      funilId: true,
      funilOrigemId: true,
      funilHistory: true,
      funil: { select: { id: true, name: true } },
    },
  });

  let moved = 0;
  for (const card of cards) {
    // Idempotente: já migrado (exceto funil legado "Perdidos").
    if (card.statusLegacy && card.funil?.name !== 'Perdidos') {
      continue;
    }

    const statusMeta = statusById[card.status];
    const statusName =
      statusMeta?.name ??
      LEGACY_STATUS_CODE_MAP[card.status] ??
      (typeof card.status === 'string' ? card.status : null);

    let targetFunilName =
      (statusName && LEGACY_STATUS_TO_FUNIL[statusName]) || null;

    // Já no funil legado Perdidos
    if (card.funil?.name === 'Perdidos') {
      targetFunilName = CRM_REPROVADO_FUNIL_NAME;
    }

    // Se o card já está em um dos funis-etapa padrão e não há status mapeável, mantém.
    if (
      !targetFunilName &&
      card.funil?.name &&
      funilByName.has(card.funil.name)
    ) {
      continue;
    }

    if (!targetFunilName) {
      targetFunilName = 'Novo Lead';
    }

    const target = funilByName.get(targetFunilName);
    if (!target) continue;

    const alreadyThere = card.funilId === target.id;
    const needsLegacy =
      !card.statusLegacy && statusName && statusName !== targetFunilName;

    if (alreadyThere && !needsLegacy) continue;

    const history = appendFunilHistoryEntry(card.funilHistory, {
      funilId: target.id,
      funilName: target.name,
      at: new Date().toISOString(),
      fromFunilId: card.funilId,
      fromFunilName: card.funil?.name ?? null,
      statusLegacy: statusName,
      reason: 'migration_status_to_funil',
    });

    const data: {
      funilId: string;
      statusLegacy?: string;
      funilHistory: FunilHistoryEntry[];
      funilOrigemId?: string | null;
      status?: string;
      closedAt?: Date | null;
    } = {
      funilId: target.id,
      funilHistory: history,
    };

    if (!card.statusLegacy && statusName) {
      data.statusLegacy = statusName;
    }

    if (targetFunilName === CRM_REPROVADO_FUNIL_NAME) {
      data.funilOrigemId = card.funilOrigemId ?? card.funilId;
      data.closedAt = new Date();
      if (perdidoStatus) data.status = perdidoStatus.id;
    } else if (targetFunilName === 'Orçamento Pago') {
      data.closedAt = new Date();
      if (fechadoStatus) data.status = fechadoStatus.id;
    } else if (novoLeadStatusId && !statusMeta) {
      data.status = novoLeadStatusId;
    }

    await client.crmCard.update({ where: { id: card.id }, data });
    moved += 1;
  }

  return { moved, total: cards.length };
}

export async function seedCrmDefaults(client: Db) {
  for (const row of DEFAULT_STATUSES) {
    await client.crmStatus.upsert({
      where: { name: row.name },
      create: row,
      update: { color: row.color, order: row.order },
    });
  }

  for (const row of DEFAULT_CHANNELS) {
    await client.crmChannel.upsert({
      where: { name: row.name },
      create: row,
      update: { color: row.color },
    });
  }

  for (const row of DEFAULT_MOTIVOS_PERDA) {
    await client.crmMotivoPerda.upsert({
      where: { name: row.name },
      create: row,
      update: { order: row.order, requiresText: row.requiresText },
    });
  }

  await ensureDefaultCrmFunis(client);
  await migrateCrmCardsToStageFunis(client);

  // Normaliza IDs de status legados (ABERTO/FECHADO/…)
  const statuses = await client.crmStatus.findMany();
  const byName = Object.fromEntries(statuses.map((s) => [s.name, s.id]));
  const novoLeadId = byName['Novo Lead'];
  if (novoLeadId) {
    const cards = await client.crmCard.findMany({
      select: { id: true, status: true },
    });
    for (const card of cards) {
      const legacyName = LEGACY_STATUS_CODE_MAP[card.status];
      const nextStatus =
        legacyName && byName[legacyName]
          ? byName[legacyName]
          : !statuses.some((s) => s.id === card.status)
            ? novoLeadId
            : card.status;
      if (nextStatus !== card.status) {
        await client.crmCard.update({
          where: { id: card.id },
          data: { status: nextStatus },
        });
      }
    }
  }
}

export async function getDefaultCrmStatusId(client: Db): Promise<string> {
  const row = await client.crmStatus.findFirst({
    where: { name: 'Novo Lead' },
    orderBy: { order: 'asc' },
  });
  if (!row) {
    throw new Error('CRM status seed missing: Novo Lead');
  }
  return row.id;
}

export async function getCrmStatusIdByName(
  client: Db,
  name: string,
): Promise<string | null> {
  const row = await client.crmStatus.findUnique({ where: { name } });
  return row?.id ?? null;
}

export async function getDefaultCrmFunilId(client: Db): Promise<string> {
  await ensureDefaultCrmFunis(client);
  const row = await client.crmFunil.findFirst({
    where: { name: 'Novo Lead' },
    orderBy: { order: 'asc' },
  });
  if (!row) {
    throw new Error('CRM funil seed missing: Novo Lead');
  }
  return row.id;
}
