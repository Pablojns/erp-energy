/**
 * Para cada pedido com NF duplicada entre famílias, GET /v1/venda/{id}
 * e confirma se o numero da venda CA é de outra família WEG.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import axios from 'axios';
import { prisma } from '@erp/database';
import { CONTA_AZUL_API_BASE } from '../financeiro/conta-azul.auth';
import { mapContaAzulVenda, vendaWegHint, wegOrderBase } from '../financeiro/conta-azul.vendas';
import { planNfVinculoAudit } from '../financeiro/conta-azul.nf-vinculo-audit';

function loadEnvFile(): void {
  const envPath = resolve(__dirname, '../../../.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

async function main(): Promise<void> {
  loadEnvFile();
  const session = (
    await prisma.$queryRaw<Array<{ accessToken: string }>>`
      SELECT "accessToken" FROM "ContaAzulSession" LIMIT 1
    `
  )[0];
  if (!session?.accessToken) throw new Error('Sem sessão CA');
  const token = session.accessToken;

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
    ...o,
    status: String(o.status),
    history: historyByOrder.get(o.id) ?? [],
  }));
  const audit = planNfVinculoAudit({ orders, vendas: [] });
  const dupOrders = new Map(
    audit.mismatches
      .filter((r) => r.kind === 'nf_duplicada_familias')
      .map((r) => [r.orderId, r]),
  );
  const confirmed: unknown[] = [];
  const collisions: unknown[] = [];
  const errors: unknown[] = [];
  for (const [orderId, row] of dupOrders) {
    const order = orders.find((o) => o.id === orderId);
    const vendaId = order?.contaAzulVendaId;
    if (!vendaId) {
      collisions.push({ ...row, ca: null, motivoCa: 'sem contaAzulVendaId' });
      continue;
    }
    const res = await axios.get(`${CONTA_AZUL_API_BASE}/v1/venda/${vendaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30_000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      errors.push({ orderId, vendaId, status: res.status });
      continue;
    }
    const payload = res.data as Record<string, unknown>;
    const inner =
      payload.venda && typeof payload.venda === 'object'
        ? (payload.venda as Record<string, unknown>)
        : payload;
    const mapped = mapContaAzulVenda(inner);
    const hint = mapped ? vendaWegHint(mapped) : String(inner.numero ?? '');
    const same = wegOrderBase(hint) === wegOrderBase(order?.externalOrderNumber);
    const entry = {
      code: order?.code,
      externalOrderNumber: order?.externalOrderNumber,
      invoiceNumber: order?.invoiceNumber,
      nfDigits: row.nfDigits,
      otherExternal: row.otherExternal,
      vendaId,
      vendaNumero: mapped?.numero ?? inner.numero ?? null,
      sameFamily: same,
    };
    if (same) collisions.push(entry);
    else confirmed.push(entry);
  }
  console.log(
    JSON.stringify(
      {
        dupOrders: dupOrders.size,
        confirmedWrongFamily: confirmed.length,
        likelyNfNumberCollision: collisions.length,
        errorCount: errors.length,
        confirmed,
        collisions,
        errors,
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
