/**
 * Migra cards CRM: status antigo → funil-etapa padrão.
 * Também cria/garante os 8 funis padrão e renomeia "Perdidos" → "Orçamento Reprovado".
 *
 * Uso (a partir da raiz do monorepo, com DATABASE_URL no .env):
 *   node --env-file=.env packages/database/scripts/migrate-crm-status-to-funis.mjs
 *
 * Idempotente: cards com statusLegacy já preenchido são ignorados
 * (exceto se ainda estiverem no funil legado "Perdidos").
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(__dirname, '../../../.env'));
loadEnvFile(resolve(__dirname, '../../.env'));

const { PrismaClient } = require('@prisma/client');

const DEFAULT_CRM_FUNIS = [
  { name: 'Novo Lead', color: '#6366f1', order: 0 },
  { name: 'Orçamento Solicitado', color: '#3b82f6', order: 1 },
  { name: 'Orçamento Enviado', color: '#0ea5e9', order: 2 },
  { name: 'Orçamento Quente', color: '#f59e0b', order: 3 },
  { name: 'Orçamento Aprovado', color: '#84cc16', order: 4 },
  { name: 'Pedido Entregue', color: '#22c55e', order: 5 },
  { name: 'Orçamento Pago', color: '#10b981', order: 6 },
  { name: 'Orçamento Reprovado', color: '#71717a', order: 7 },
];

const CRM_REPROVADO_FUNIL_NAME = 'Orçamento Reprovado';

const LEGACY_STATUS_CODE_MAP = {
  ABERTO: 'Novo Lead',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
  NOVO_LEAD: 'Novo Lead',
};

const LEGACY_STATUS_TO_FUNIL = {
  'Novo Lead': 'Novo Lead',
  'Orçamento Solicitado': 'Orçamento Solicitado',
  'Em Negociação': 'Orçamento Quente',
  'Cliente não respondeu': 'Orçamento Enviado',
  Fechado: 'Orçamento Pago',
  Perdido: 'Orçamento Reprovado',
};

function parseFunilHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e) =>
      e &&
      typeof e === 'object' &&
      typeof e.funilId === 'string' &&
      typeof e.funilName === 'string',
  );
}

function appendFunilHistoryEntry(raw, entry) {
  const prev = parseFunilHistory(raw);
  const last = prev[prev.length - 1];
  if (last && last.funilId === entry.funilId) return prev;
  return [...prev, entry];
}

async function ensureDefaultCrmFunis(prisma) {
  const byName = new Map();

  for (const row of DEFAULT_CRM_FUNIS) {
    const existing = await prisma.crmFunil.findFirst({
      where: { name: row.name },
    });
    if (existing) {
      await prisma.crmFunil.update({
        where: { id: existing.id },
        data: { color: existing.color ?? row.color },
      });
      byName.set(row.name, existing);
    } else {
      const created = await prisma.crmFunil.create({
        data: {
          name: row.name,
          order: row.order,
          color: row.color,
        },
      });
      byName.set(row.name, created);
      console.log(`  + funil criado: ${row.name}`);
    }
  }

  const legacyPerdidos = await prisma.crmFunil.findFirst({
    where: { name: 'Perdidos' },
  });
  const reprovado = byName.get(CRM_REPROVADO_FUNIL_NAME);
  if (legacyPerdidos && reprovado && legacyPerdidos.id !== reprovado.id) {
    await prisma.crmCard.updateMany({
      where: { funilId: legacyPerdidos.id },
      data: { funilId: reprovado.id },
    });
    await prisma.crmCard.updateMany({
      where: { funilOrigemId: legacyPerdidos.id },
      data: { funilOrigemId: reprovado.id },
    });
    const stillUsed = await prisma.crmCard.count({
      where: {
        OR: [
          { funilId: legacyPerdidos.id },
          { funilOrigemId: legacyPerdidos.id },
        ],
      },
    });
    if (stillUsed === 0) {
      await prisma.crmFunil.delete({ where: { id: legacyPerdidos.id } });
      console.log('  - funil legado "Perdidos" removido (cards movidos)');
    }
  } else if (legacyPerdidos && !reprovado) {
    await prisma.crmFunil.update({
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
    console.log('  ~ funil "Perdidos" renomeado para "Orçamento Reprovado"');
  }

  for (const row of DEFAULT_CRM_FUNIS) {
    const f = byName.get(row.name);
    if (!f) continue;
    await prisma.crmFunil.update({
      where: { id: f.id },
      data: { order: row.order },
    });
  }

  const defaultNames = new Set(DEFAULT_CRM_FUNIS.map((f) => f.name));
  const extras = await prisma.crmFunil.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  });
  const custom = extras.filter((f) => !defaultNames.has(f.name));
  let nextOrder = DEFAULT_CRM_FUNIS.length;
  for (const f of custom) {
    if (f.order !== nextOrder) {
      await prisma.crmFunil.update({
        where: { id: f.id },
        data: { order: nextOrder },
      });
    }
    nextOrder += 1;
  }

  return byName;
}

async function migrateCrmCardsToStageFunis(prisma, funilByName) {
  const statuses = await prisma.crmStatus.findMany();
  const statusById = Object.fromEntries(statuses.map((s) => [s.id, s]));
  const novoLeadStatusId =
    statuses.find((s) => s.name === 'Novo Lead')?.id ?? statuses[0]?.id;
  const perdidoStatus = statuses.find((s) => s.name === 'Perdido');
  const fechadoStatus = statuses.find((s) => s.name === 'Fechado');

  const cards = await prisma.crmCard.findMany({
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

    if (card.funil?.name === 'Perdidos') {
      targetFunilName = CRM_REPROVADO_FUNIL_NAME;
    }

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

    const data = {
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

    await prisma.crmCard.update({ where: { id: card.id }, data });
    moved += 1;
  }

  return { moved, total: cards.length };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definido. Use --env-file=.env ou exporte a variável.',
    );
  }
  const prisma = new PrismaClient();
  try {
    console.log('CRM: garantindo funis padrão…');
    const funilByName = await ensureDefaultCrmFunis(prisma);
    console.log(`  ${funilByName.size} funis padrão ok`);

    console.log('CRM: migrando cards (status → funil)…');
    const result = await migrateCrmCardsToStageFunis(prisma, funilByName);
    console.log(
      `Concluído: ${result.moved} card(s) atualizado(s) de ${result.total} total.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
