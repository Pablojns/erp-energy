/* Aplica no banco da aplicação o DDL da migration 20260806150000_order_exit_per_cycle.
   Idempotente: pode rodar mais de uma vez. */
const fs = require('fs');
const path = require('path');
for (const line of fs
  .readFileSync(path.join(__dirname, '..', '..', '.env'), 'utf8')
  .split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0 && !(t.slice(0, i).trim() in process.env)) {
    process.env[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
}
const { prisma } = require('@erp/database');

const url = process.env.DATABASE_URL ?? '';
console.log('banco:', url.replace(/\/\/[^@]*@/, '//***@'));

async function indexes() {
  return prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'OrderExit' ORDER BY indexname`,
  );
}

async function main() {
  console.log('antes:', (await indexes()).map((r) => r.indexname).join(', '));

  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "OrderExit_orderId_key"`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OrderExit_orderId_idx" ON "OrderExit"("orderId")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "OrderExit_orderId_exitDate_idx" ON "OrderExit"("orderId", "exitDate")`,
  );

  console.log('depois:', (await indexes()).map((r) => r.indexname).join(', '));
}

main()
  .catch((e) => {
    console.error('ERRO:', e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
