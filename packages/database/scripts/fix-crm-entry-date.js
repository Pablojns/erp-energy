/**
 * Corrige CrmCard.entryDate sobrescrito pela data de edição.
 *
 * Estratégia:
 * 1) Se entryDate cai no mesmo dia de updatedAt e é posterior a createdAt →
 *    restaura entryDate = createdAt (padrão do bug: save regravava a data).
 * 2) Se houver touchpoint concluído com data anterior a entryDate e próxima
 *    de createdAt, mantém createdAt (mais confiável).
 * 3) AuditLog de CrmCard não é usado hoje para criação — sem fonte melhor.
 *
 * Uso:
 *   node packages/database/scripts/fix-crm-entry-date.js
 *   node packages/database/scripts/fix-crm-entry-date.js --apply
 */
const { PrismaClient } = require('@prisma/client');

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function dayKey(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const cards = await prisma.crmCard.findMany({
    select: {
      id: true,
      name: true,
      createdAt: true,
      entryDate: true,
      updatedAt: true,
      touchpointRecords: {
        where: { done: true },
        select: { date: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  });

  const toFix = [];
  for (const card of cards) {
    const createdDay = dayKey(card.createdAt);
    const entryDay = dayKey(card.entryDate);
    const updatedDay = dayKey(card.updatedAt);
    const firstTp = card.touchpointRecords[0];
    const firstTpAt = firstTp ? firstTp.date ?? firstTp.createdAt : null;

    const looksOverwritten =
      entryDay !== createdDay &&
      card.entryDate.getTime() > card.createdAt.getTime() + 12 * 60 * 60 * 1000 &&
      (entryDay === updatedDay ||
        // default de migration (@default(now())) gravou a data do deploy em entryDate
        card.entryDate.getTime() - card.createdAt.getTime() > 24 * 60 * 60 * 1000);

    const entryAfterFirstTouch =
      firstTpAt != null &&
      entryDay !== createdDay &&
      card.entryDate.getTime() > firstTpAt.getTime() &&
      Math.abs(firstTpAt.getTime() - card.createdAt.getTime()) < 7 * 86400000;

    if (looksOverwritten || entryAfterFirstTouch) {
      toFix.push({
        id: card.id,
        name: card.name,
        createdAt: createdDay,
        entryDate: entryDay,
        updatedAt: updatedDay,
        firstTouchpoint: firstTpAt ? dayKey(firstTpAt) : null,
        reason: looksOverwritten
          ? 'entryDate posterior a createdAt (sobrescrita/migração)'
          : 'entryDate posterior ao primeiro touchpoint',
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        totalCards: cards.length,
        candidates: toFix.length,
        apply: APPLY,
        sample: toFix.slice(0, 20),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log('\nDry-run only. Reexecute with --apply to restore entryDate = createdAt.');
    return;
  }

  let updated = 0;
  for (const row of toFix) {
    const card = cards.find((c) => c.id === row.id);
    if (!card) continue;
    await prisma.crmCard.update({
      where: { id: row.id },
      data: { entryDate: card.createdAt },
    });
    updated += 1;
  }
  console.log(`\nRestored entryDate on ${updated} card(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
