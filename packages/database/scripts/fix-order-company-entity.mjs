/**
 * Corrige companyEntityId atribuído invertido após a fundação Multi-CNPJ.
 *
 * Regras:
 * - SITE com CNPJ São Paulo → Londrina
 * - WEG_MERCADO_ELETRONICO sem CNPJ → São Paulo
 *
 * Uso (raiz do monorepo):
 *   node packages/database/scripts/fix-order-company-entity.mjs
 *   node packages/database/scripts/fix-order-company-entity.mjs --apply
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

loadEnv('.env');
loadEnv('apps/api/.env');
loadEnv('packages/database/.env');

const apply = process.argv.includes('--apply');
const { PrismaClient, OrderSource } = createRequire(import.meta.url)(
  '@prisma/client',
);
const prisma = new PrismaClient();

const CNPJ_SAO_PAULO = '48783884000124';
const CNPJ_LONDRINA = '48783884000205';

async function main() {
  console.log(apply ? 'MODO APPLY' : 'MODO DRY-RUN (passe --apply para gravar)');

  const saoPaulo = await prisma.companyEntity.findFirst({
    where: { cnpj: CNPJ_SAO_PAULO },
    select: { id: true, name: true, cnpj: true },
  });
  const londrina = await prisma.companyEntity.findFirst({
    where: { cnpj: CNPJ_LONDRINA },
    select: { id: true, name: true, cnpj: true },
  });

  if (!saoPaulo || !londrina) {
    throw new Error(
      `CompanyEntity ausente. SP=${Boolean(saoPaulo)} Londrina=${Boolean(londrina)}`,
    );
  }

  console.log(`São Paulo: ${saoPaulo.name} (${saoPaulo.id})`);
  console.log(`Londrina:  ${londrina.name} (${londrina.id})`);

  const siteWrong = await prisma.order.findMany({
    where: {
      source: OrderSource.SITE,
      companyEntityId: saoPaulo.id,
    },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const wegMissing = await prisma.order.findMany({
    where: {
      source: OrderSource.WEG_MERCADO_ELETRONICO,
      companyEntityId: null,
    },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\nSITE com CNPJ SP (→ Londrina): ${siteWrong.length}`);
  for (const o of siteWrong.slice(0, 20)) {
    console.log(
      `  - ${o.code} / ${o.externalOrderNumber ?? '—'} (${o.id})`,
    );
  }
  if (siteWrong.length > 20) console.log(`  … +${siteWrong.length - 20} mais`);

  console.log(`\nWEG sem CNPJ (→ São Paulo): ${wegMissing.length}`);
  for (const o of wegMissing.slice(0, 20)) {
    console.log(
      `  - ${o.code} / ${o.externalOrderNumber ?? '—'} (${o.id})`,
    );
  }
  if (wegMissing.length > 20) console.log(`  … +${wegMissing.length - 20} mais`);

  if (!apply) {
    console.log('\nNenhuma alteração gravada.');
    return;
  }

  if (siteWrong.length) {
    const r = await prisma.order.updateMany({
      where: { id: { in: siteWrong.map((o) => o.id) } },
      data: { companyEntityId: londrina.id },
    });
    console.log(`\nAtualizados SITE → Londrina: ${r.count}`);
  }

  if (wegMissing.length) {
    const r = await prisma.order.updateMany({
      where: { id: { in: wegMissing.map((o) => o.id) } },
      data: { companyEntityId: saoPaulo.id },
    });
    console.log(`Atualizados WEG → São Paulo: ${r.count}`);
  }

  console.log('\nConcluído.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
