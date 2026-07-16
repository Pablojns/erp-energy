/**
 * Corrige pedidos com invoiceNumber literal "-" (placeholder da planilha WEG) → null.
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-invoice-dash.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '@erp/database';

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../../.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
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
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    /* .env opcional se DATABASE_URL já estiver no ambiente */
  }
}

async function main() {
  loadEnvFile();
  console.log('=== fix-invoice-dash ===');

  const before = await prisma.order.count({
    where: { invoiceNumber: '-' },
  });
  console.log(`Pedidos com invoiceNumber = "-": ${before}`);

  if (before === 0) {
    console.log('Nada a corrigir.');
    return;
  }

  const result = await prisma.order.updateMany({
    where: { invoiceNumber: '-' },
    data: { invoiceNumber: null },
  });

  console.log(`Pedidos atualizados: ${result.count}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
