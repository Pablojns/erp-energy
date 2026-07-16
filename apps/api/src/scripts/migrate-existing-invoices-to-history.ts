/**
 * Migra invoiceNumber existentes para OrderInvoiceHistory.
 * Em pedidos PARCIAL/NOVO, limpa invoiceNumber (nota fica só no histórico).
 * Em FINALIZADO, mantém invoiceNumber no pedido.
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrate-existing-invoices-to-history.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { OrderStatus, prisma } from '@erp/database';

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
  console.log('=== migrate-existing-invoices-to-history ===');

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
        status: true,
        invoiceNumber: true,
        createdAt: true,
        updatedAt: true,
        orderDate: true,
        invoicedAt: true,
        items: { select: { pickedQty: true } },
        invoiceHistory: {
          select: { invoiceNumber: true },
        },
      },
    });

    let created = 0;
    let skipped = 0;
    let cleared = 0;

    for (const order of orders) {
      const invoice = order.invoiceNumber?.trim();
      if (!invoice) {
        skipped += 1;
        continue;
      }

      const label = order.externalOrderNumber?.trim() || order.code;
      const already = order.invoiceHistory.some(
        (h) => h.invoiceNumber.trim() === invoice,
      );

      if (!already) {
        const pickedQtyAtTime = order.items.reduce(
          (sum, it) => sum + (it.pickedQty ?? 0),
          0,
        );
        const historyAt =
          order.invoicedAt ??
          order.updatedAt ??
          order.orderDate ??
          order.createdAt ??
          new Date();

        await prisma.orderInvoiceHistory.create({
          data: {
            orderId: order.id,
            invoiceNumber: invoice,
            pickedQtyAtTime,
            createdAt: historyAt,
            createdBy: null,
          },
        });
        created += 1;
        console.log(
          `[hist] ${label} → NF ${invoice} (picked ${pickedQtyAtTime})`,
        );
      } else {
        skipped += 1;
      }

      // PARCIAL / NOVO: limpa invoiceNumber do pedido (histórico já preserva).
      // FINALIZADO: mantém invoiceNumber.
      if (
        order.status === OrderStatus.PARCIAL ||
        order.status === OrderStatus.NOVO
      ) {
        await prisma.order.update({
          where: { id: order.id },
          data: { invoiceNumber: null },
        });
        cleared += 1;
        console.log(`[clear] ${label} (${order.status}) invoiceNumber → null`);
      }
    }

    console.log('=== resumo ===');
    console.log(`Pedidos com NF: ${orders.length}`);
    console.log(`Históricos criados: ${created}`);
    console.log(`Já existiam / vazios: ${skipped}`);
    console.log(`invoiceNumber limpos (PARCIAL/NOVO): ${cleared}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
