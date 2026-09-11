/**
 * Corrige pedidos em que o bug antigo gravou o número da remessa em
 * invoiceNumber (Nota de Venda). Padrão: invoiceNumber == notaRemessa.
 *
 * - Limpa invoiceNumber (fica em branco para o usuário preencher a venda real)
 * - Mantém notaRemessa intacto
 * - Remove só o histórico que gravou a remessa como se fosse NF de venda
 * - Não altera OrderExit (saída física pode ser remessa de verdade)
 *
 * Uso (em apps/api), dry-run primeiro:
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-remessa-copied-to-invoice.ts
 *
 * Conferir o relatório e, só então, aplicar:
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-remessa-copied-to-invoice.ts --apply
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { InvoiceStatus, prisma } from '@erp/database';
import {
  invoiceNumberDigits,
  invoiceNumberMatchesRemessa,
} from '../orders/order-search';

type AffectedRow = {
  id: string;
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
  notaRemessa: string | null;
  invoiceStatus: InvoiceStatus;
};

type HistoryRow = {
  id: string;
  orderId: string;
  invoiceNumber: string;
};

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
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch {
      /* .env opcional se DATABASE_URL já estiver no ambiente */
    }
  }
}

function databaseLabel(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(DATABASE_URL ausente)';
  try {
    const u = new URL(raw);
    const db = u.pathname.replace(/^\//, '') || '?';
    const port = u.port ? `:${u.port}` : '';
    return `${u.hostname}${port}/${db}`;
  } catch {
    return '(URL inválida)';
  }
}

function pedidoLabel(row: AffectedRow): string {
  return row.externalOrderNumber?.trim() || row.code;
}

async function findAffected(): Promise<{
  orders: AffectedRow[];
  history: HistoryRow[];
}> {
  const candidates = await prisma.$queryRaw<AffectedRow[]>`
    SELECT
      o.id,
      o.code,
      o."externalOrderNumber",
      o."invoiceNumber",
      o."notaRemessa",
      o."invoiceStatus"
    FROM "Order" o
    WHERE o."invoiceNumber" IS NOT NULL AND btrim(o."invoiceNumber") <> ''
      AND o."notaRemessa" IS NOT NULL AND btrim(o."notaRemessa") <> ''
      AND regexp_replace(o."invoiceNumber", '[^0-9]', '', 'g') <> ''
      AND regexp_replace(o."notaRemessa", '[^0-9]', '', 'g') <> ''
      AND regexp_replace(o."invoiceNumber", '[^0-9]', '', 'g')
        = regexp_replace(o."notaRemessa", '[^0-9]', '', 'g')
  `;

  const orders = candidates.filter(
    (row) =>
      invoiceNumberDigits(String(row.invoiceNumber ?? '')) !== '' &&
      invoiceNumberMatchesRemessa(row.invoiceNumber, row.notaRemessa),
  );
  if (orders.length === 0) {
    return { orders, history: [] };
  }

  const ids = orders.map((row) => row.id);
  const remessaByOrder = new Map(
    orders.map((row) => [row.id, row.notaRemessa] as const),
  );
  const historyCandidates = await prisma.orderInvoiceHistory.findMany({
    where: { orderId: { in: ids } },
    select: { id: true, orderId: true, invoiceNumber: true },
  });
  const history = historyCandidates.filter((row) =>
    invoiceNumberMatchesRemessa(
      row.invoiceNumber,
      remessaByOrder.get(row.orderId),
    ),
  );

  return { orders, history };
}

function printReport(
  orders: AffectedRow[],
  history: HistoryRow[],
  apply: boolean,
): void {
  const historyByOrder = new Map<string, number>();
  for (const row of history) {
    historyByOrder.set(row.orderId, (historyByOrder.get(row.orderId) ?? 0) + 1);
  }

  console.log('=== fix-remessa-copied-to-invoice ===');
  console.log(
    apply
      ? 'Modo: APPLY (vai alterar o banco)'
      : 'Modo: DRY-RUN (não altera nada)',
  );
  console.log(`Banco: ${databaseLabel()}`);
  console.log(`Pedidos afetados: ${orders.length}`);
  console.log(
    `Histórico a remover (remessa gravada como NF de venda): ${history.length} linha(s)`,
  );
  console.log('');

  if (orders.length === 0) {
    console.log('Nada a corrigir.');
    return;
  }

  const sample = [...orders].sort((a, b) => {
    const aKey = pedidoLabel(a);
    const bKey = pedidoLabel(b);
    if (aKey === '4518243778') return -1;
    if (bKey === '4518243778') return 1;
    return aKey.localeCompare(bKey);
  });
  const shown = sample.slice(0, 25);

  console.log('Exemplos (antes → depois):');
  for (const row of shown) {
    const hist = historyByOrder.get(row.id) ?? 0;
    console.log(
      `  ${pedidoLabel(row)} | Nota de Venda "${row.invoiceNumber}" → (vazio) | Remessa "${row.notaRemessa}" (mantida) | hist: ${hist} linha(s)`,
    );
  }
  if (orders.length > shown.length) {
    console.log(`  … +${orders.length - shown.length} outro(s)`);
  }
}

async function applyFix(
  orders: AffectedRow[],
  history: HistoryRow[],
): Promise<void> {
  const historyIds = history.map((row) => row.id);
  const orderIds = orders.map((row) => row.id);

  await prisma.$transaction(async (tx) => {
    if (historyIds.length > 0) {
      await tx.orderInvoiceHistory.deleteMany({
        where: { id: { in: historyIds } },
      });
    }
    await tx.order.updateMany({
      where: { id: { in: orderIds } },
      data: {
        invoiceNumber: null,
        invoiceStatus: InvoiceStatus.NOT_FOUND,
        invoicedAt: null,
      },
    });
  });
}

async function verifyExample(): Promise<void> {
  const row = await prisma.order.findFirst({
    where: { externalOrderNumber: '4518243778' },
    select: {
      invoiceNumber: true,
      notaRemessa: true,
      invoiceStatus: true,
    },
  });
  if (!row) {
    console.log('');
    console.log('Pedido 4518243778 não encontrado neste banco.');
    return;
  }
  console.log('');
  console.log('Conferência pedido 4518243778:');
  console.log(`  Nota de Venda: ${row.invoiceNumber ?? '(vazio)'}`);
  console.log(`  Remessa: ${row.notaRemessa ?? '(vazio)'}`);
  console.log(`  invoiceStatus: ${row.invoiceStatus}`);
}

async function main() {
  loadEnvFile();
  const apply = process.argv.includes('--apply');
  const { orders, history } = await findAffected();
  printReport(orders, history, apply);

  if (!apply) {
    console.log('');
    console.log(
      'Para aplicar: npx ts-node -r tsconfig-paths/register src/scripts/fix-remessa-copied-to-invoice.ts --apply',
    );
    if (orders.some((row) => pedidoLabel(row) === '4518243778')) {
      console.log('Pedido 4518243778 está na lista e seria corrigido.');
    }
    return;
  }

  if (orders.length === 0) {
    await verifyExample();
    return;
  }

  await applyFix(orders, history);
  console.log('');
  console.log(
    `Aplicado: ${orders.length} pedido(s) com Nota de Venda limpa; ${history.length} linha(s) de histórico removida(s).`,
  );
  await verifyExample();
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
