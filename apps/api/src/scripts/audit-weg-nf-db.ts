/**
 * Dry-run só no banco (sem Conta Azul): NFs duplicadas entre famílias WEG,
 * invoiceNumber sem histórico, e candidatos à limpeza de pedidos antigos.
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/audit-weg-nf-db.ts
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { prisma } from '@erp/database';
import {
  planNfVinculoAudit,
  planOldCompletedCleanup,
} from '../financeiro/conta-azul.nf-vinculo-audit';

function loadEnvFile(): void {
  const candidates = [
    resolve(__dirname, '../../../.env'),
    resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
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
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      /* ignore */
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const [orderRows, historyRows] = await Promise.all([
    prisma.order.findMany({
      select: {
        id: true,
        code: true,
        externalOrderNumber: true,
        invoiceNumber: true,
        notaRemessa: true,
        status: true,
        contaAzulVendaId: true,
        items: {
          select: {
            quantity: true,
            pickedQty: true,
            missingQty: true,
            invoicedQty: true,
          },
        },
      },
    }),
    prisma.orderInvoiceHistory.findMany({
      select: { orderId: true, invoiceNumber: true },
    }),
  ]);
  const historyByOrder = new Map<string, Array<{ invoiceNumber: string }>>();
  for (const row of historyRows) {
    const list = historyByOrder.get(row.orderId) ?? [];
    list.push({ invoiceNumber: row.invoiceNumber });
    historyByOrder.set(row.orderId, list);
  }
  const orders = orderRows.map((o) => ({
    id: o.id,
    code: o.code,
    externalOrderNumber: o.externalOrderNumber,
    invoiceNumber: o.invoiceNumber,
    notaRemessa: o.notaRemessa,
    status: String(o.status),
    contaAzulVendaId: o.contaAzulVendaId,
    history: historyByOrder.get(o.id) ?? [],
    items: o.items,
  }));
  const audit = planNfVinculoAudit({ orders, vendas: [] });
  const cleanup = planOldCompletedCleanup(orders);
  const spotlight = ['4517818598', '4519085342'];
  const uniqueDupNfs = [
    ...new Set(
      audit.mismatches
        .filter((r) => r.kind === 'nf_duplicada_familias')
        .map((r) => r.nfDigits)
        .filter((d): d is string => Boolean(d)),
    ),
  ];
  const dupOrderIds = new Set(
    audit.mismatches
      .filter((r) => r.kind === 'nf_duplicada_familias')
      .map((r) => r.orderId),
  );
  console.log(
    JSON.stringify(
      {
        database: (process.env.DATABASE_URL ?? '').replace(/:[^:@/]+@/, ':***@'),
        pedidos: orders.length,
        ordersAffected: audit.ordersAffected,
        mismatchCount: audit.mismatches.length,
        byKind: audit.byKind,
        pedidosComNfDuplicadaEntreFamilias: dupOrderIds.size,
        uniqueDupNfs: uniqueDupNfs.length,
        uniqueDupNfsSample: uniqueDupNfs.slice(0, 40),
        spotlight,
        spotlightMismatches: audit.mismatches.filter((row) => {
          const ext = String(row.externalOrderNumber ?? '');
          const exp = String(row.expectedExternal ?? '');
          const oth = String(row.otherExternal ?? '');
          return spotlight.some(
            (n) => ext.startsWith(n) || exp.startsWith(n) || oth.startsWith(n),
          );
        }),
        oldCompletedCleanup: cleanup.length,
        oldCompletedSample: cleanup.slice(0, 20),
        dupExamples: audit.mismatches
          .filter((r) => r.kind === 'nf_duplicada_familias')
          .slice(0, 40),
        invoiceSemHistoricoSample: audit.mismatches
          .filter((r) => r.kind === 'invoice_sem_historico')
          .slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
