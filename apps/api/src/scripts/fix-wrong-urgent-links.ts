/**
 * Remove vínculos incorretos de pedido urgente (linkedOrderId) quando
 * CNPJ / SKUs / quantidades não batem 100%.
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-wrong-urgent-links.ts
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
    /* .env opcional se DATABASE_URL já estiver no ambiente */
  }
}

function normalizeCnpjDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function normalizeSkuKey(sku: string | null | undefined): string {
  return (sku ?? '').trim().toUpperCase();
}

function aggregateSkuQuantities(
  items: Array<{ sku: string; quantity: number }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const sku = normalizeSkuKey(item.sku);
    if (!sku) continue;
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map.set(sku, (map.get(sku) ?? 0) + qty);
  }
  return map;
}

function skuQuantityMapsMatch(
  a: Map<string, number>,
  b: Map<string, number>,
): boolean {
  if (a.size === 0 || b.size === 0) return false;
  if (a.size !== b.size) return false;
  for (const [sku, qty] of a) {
    if (b.get(sku) !== qty) return false;
  }
  for (const [sku, qty] of b) {
    if (a.get(sku) !== qty) return false;
  }
  return true;
}

function isExactUrgentMatch(opts: {
  linkedCnpj: string | null;
  importedCnpj: string | null;
  linkedItems: Array<{ sku: string; quantity: number }>;
  importedItems: Array<{ sku: string; quantity: number }>;
}): boolean {
  const cnpjA = normalizeCnpjDigits(opts.linkedCnpj);
  const cnpjB = normalizeCnpjDigits(opts.importedCnpj);
  if (!cnpjA || !cnpjB || cnpjA !== cnpjB) return false;
  return skuQuantityMapsMatch(
    aggregateSkuQuantities(opts.linkedItems),
    aggregateSkuQuantities(opts.importedItems),
  );
}

async function resolveCarrierIdFromCnpj(
  deliveryCnpj: string | null,
): Promise<string | null> {
  const digits = normalizeCnpjDigits(deliveryCnpj);
  if (!digits) return null;
  const row = await prisma.carrierDocument.findUnique({
    where: { document: digits },
    select: { carrierId: true },
  });
  return row?.carrierId ?? null;
}

async function main() {
  loadEnvFile();
  console.log('=== fix-wrong-urgent-links ===');

  const linked = await prisma.order.findMany({
    where: { linkedOrderId: { not: null } },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      status: true,
      deliveryCnpj: true,
      customerDocument: true,
      linkedOrderId: true,
      notaRemessa: true,
      carrierId: true,
      items: { select: { sku: true, quantity: true } },
      linkedOrder: {
        select: {
          id: true,
          code: true,
          customerDocument: true,
          deliveryCnpj: true,
          notaRemessa: true,
          carrierId: true,
          items: { select: { sku: true, quantity: true } },
        },
      },
    },
  });

  console.log(`Pedidos com linkedOrderId: ${linked.length}`);

  let fixed = 0;
  let kept = 0;
  let orphan = 0;

  for (const order of linked) {
    const label = order.externalOrderNumber?.trim() || order.code;
    const urgent = order.linkedOrder;

    if (!urgent) {
      orphan += 1;
      await prisma.order.update({
        where: { id: order.id },
        data: {
          linkedOrderId: null,
          notaRemessa: null,
          ...(order.status === OrderStatus.AGUARDANDO_NF
            ? { status: OrderStatus.NOVO }
            : {}),
        },
      });
      console.log(`[orphan] ${label}: linkedOrder ausente → vínculo removido`);
      fixed += 1;
      continue;
    }

    const exact = isExactUrgentMatch({
      linkedCnpj: urgent.customerDocument ?? urgent.deliveryCnpj,
      importedCnpj: order.deliveryCnpj ?? order.customerDocument,
      linkedItems: urgent.items,
      importedItems: order.items,
    });

    if (exact) {
      kept += 1;
      continue;
    }

    const resolvedCarrierId = await resolveCarrierIdFromCnpj(order.deliveryCnpj);
    const data: {
      linkedOrderId: null;
      notaRemessa: null;
      carrierId: string | null;
      status?: typeof OrderStatus.NOVO;
    } = {
      linkedOrderId: null,
      notaRemessa: null,
      // Remove carrier herdado do urgente; tenta resolver pelo CNPJ do pedido.
      carrierId: resolvedCarrierId,
    };

    if (order.status === OrderStatus.AGUARDANDO_NF) {
      data.status = OrderStatus.NOVO;
    }

    await prisma.order.update({
      where: { id: order.id },
      data,
    });

    fixed += 1;
    const urgentLabel = urgent.code;
    console.log(
      `[unlink] ${label} ⟂ ${urgentLabel}: match inexacto (SKU/qty/CNPJ) → vínculo removido` +
        (data.status ? ` · status ${order.status} → NOVO` : ''),
    );
  }

  console.log('=== resumo ===');
  console.log(`Mantidos (match exato): ${kept}`);
  console.log(`Corrigidos (vínculo removido): ${fixed}`);
  console.log(`Órfãos (linkedOrder sumiu): ${orphan}`);
}

void main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
