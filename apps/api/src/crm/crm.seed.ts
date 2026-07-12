import type { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService['client'];

const DEFAULT_STATUSES = [
  { name: 'Novo Lead', color: '#6366f1', order: 0 },
  { name: 'Orçamento Solicitado', color: '#3b82f6', order: 1 },
  { name: 'Em Negociação', color: '#f59e0b', order: 2 },
  { name: 'Cliente não respondeu', color: '#ef4444', order: 3 },
  { name: 'Fechado', color: '#22c55e', order: 4 },
  { name: 'Perdido', color: '#71717a', order: 5 },
] as const;

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

const LEGACY_STATUS_MAP: Record<string, string> = {
  ABERTO: 'Novo Lead',
  FECHADO: 'Fechado',
  PERDIDO: 'Perdido',
};

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

  const statuses = await client.crmStatus.findMany();
  const byName = Object.fromEntries(statuses.map((s) => [s.name, s.id]));
  const novoLeadId = byName['Novo Lead'];

  if (novoLeadId) {
    const cards = await client.crmCard.findMany({ select: { id: true, status: true } });
    for (const card of cards) {
      const legacyName = LEGACY_STATUS_MAP[card.status];
      const nextStatus =
        legacyName && byName[legacyName]
          ? byName[legacyName]
          : card.status === 'NOVO_LEAD' || !statuses.some((s) => s.id === card.status)
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
