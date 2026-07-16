/**
 * Migra invoiceNumber atual dos pedidos para OrderInvoiceHistory.
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-invoice-history.ts
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
    /* .env opcional */
  }
}

async function main() {
  loadEnvFile();
  console.log('=== migrate-invoice-history ===');

  try {
    const orders = await prisma.order.findMany({
      where: {
        AND: [
          { invoiceNumber: { not: null } },
          { NOT: { invoiceNumber: '' } },
        ],
      },
      select: {
        id: true,
        code: true,
        externalOrderNumber: true,
        invoiceNumber: true,
        items: { select: { pickedQty: true } },
        invoiceHistory: {
          select: { invoiceNumber: true },
        },
      },
    });

    let created = 0;
    let skipped = 0;

    for (const order of orders) {
      const invoice = order.invoiceNumber?.trim();
      if (!invoice) {
        skipped += 1;
        continue;
      }

      const already = order.invoiceHistory.some(
        (h) => h.invoiceNumber.trim() === invoice,
      );
      if (already) {
        skipped += 1;
        continue;
      }

      const pickedQtyAtTime = order.items.reduce(
        (sum, it) => sum + (it.pickedQty ?? 0),
        0,
      );

      await prisma.orderInvoiceHistory.create({
        data: {
          orderId: order.id,
          invoiceNumber: invoice,
          pickedQtyAtTime,
          createdBy: null,
        },
      });
      created += 1;
      const label = order.externalOrderNumber?.trim() || order.code;
      console.log(`[ok] ${label} → NF ${invoice} (picked ${pickedQtyAtTime})`);
    }

    console.log('=== resumo ===');
    console.log(`Pedidos com NF: ${orders.length}`);
    console.log(`Históricos criados: ${created}`);
    console.log(`Ignorados (já existentes / vazios): ${skipped}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
