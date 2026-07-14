/**
 * Correção pontual de dados existentes:
 * 1) Pedidos FINALIZADO com itens parcialmente separados → PARCIAL + missingQty
 * 2) Pedidos com OrderExit sem StockMovement SAIDA_EXPEDICAO (ou tipo errado) → cria/corrige
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/fix-partial-orders.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  OrderStatus,
  StockMovementType,
  prisma,
} from '@erp/database';

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

const EXIT_OUTBOUND_TYPES: StockMovementType[] = [
  StockMovementType.SAIDA_EXPEDICAO,
  StockMovementType.BAIXA_EXPEDICAO,
  StockMovementType.OUTBOUND,
];

function resolveExitQty(item: {
  pickedQty: number;
  invoicedQty: number;
}): number {
  if (item.pickedQty > 0) return item.pickedQty;
  if (item.invoicedQty > 0) return item.invoicedQty;
  return 0;
}

function missingForItem(item: {
  quantity: number;
  pickedQty: number;
  invoicedQty: number;
}): number {
  const fulfilled = Math.max(item.pickedQty ?? 0, item.invoicedQty ?? 0);
  return Math.max(0, item.quantity - fulfilled);
}

function buildOrderMovementWhere(order: {
  code: string;
  externalOrderNumber: string | null;
  invoiceNumber: string | null;
}) {
  const refs = new Set<string>([order.code]);
  const ext = order.externalOrderNumber?.trim();
  if (ext) refs.add(ext);
  const inv = order.invoiceNumber?.trim();
  if (inv) refs.add(inv);

  const or: Array<Record<string, unknown>> = [
    { reference: { in: [...refs] } },
    { notes: { contains: order.code, mode: 'insensitive' } },
  ];
  if (ext) {
    or.push({ notes: { contains: ext, mode: 'insensitive' } });
  }
  if (inv) {
    or.push({ invoiceNumber: inv });
  }
  return { OR: or };
}

async function resolveProductId(item: {
  id: string;
  sku: string;
  productId: string | null;
}): Promise<string | null> {
  if (item.productId) return item.productId;
  const sku = item.sku.trim();
  if (!sku) return null;

  const found = await prisma.product.findFirst({
    where: {
      OR: [
        { sku: { equals: sku, mode: 'insensitive' } },
        { internalCode: { equals: sku, mode: 'insensitive' } },
      ],
      isActive: true,
    },
    select: { id: true },
  });
  if (!found) return null;

  await prisma.orderItem.update({
    where: { id: item.id },
    data: { productId: found.id },
  });
  return found.id;
}

async function fixPartialOrders(): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: {
      status: OrderStatus.FINALIZADO,
      items: {
        some: {
          quantity: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      items: {
        select: {
          id: true,
          quantity: true,
          pickedQty: true,
          invoicedQty: true,
          missingQty: true,
        },
      },
    },
  });

  const toFix = candidates.filter((o) =>
    o.items.some((it) => it.pickedQty < it.quantity && it.quantity > 0),
  );

  console.log(
    `[partial] Candidatos FINALIZADO: ${candidates.length}; a corrigir: ${toFix.length}`,
  );

  let fixed = 0;
  for (const order of toFix) {
    await prisma.$transaction(async (tx) => {
      for (const it of order.items) {
        await tx.orderItem.update({
          where: { id: it.id },
          data: { missingQty: missingForItem(it) },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PARCIAL },
      });
    });

    fixed += 1;
    const label = order.externalOrderNumber?.trim() || order.code;
    console.log(
      `[partial] ${label} → PARCIAL (${order.items
        .filter((it) => it.pickedQty < it.quantity)
        .map((it) => `${it.pickedQty}/${it.quantity}`)
        .join(', ')})`,
    );
  }

  console.log(`[partial] Pedidos corrigidos: ${fixed}`);
  return fixed;
}

async function fixMissingExitMovements(): Promise<{
  created: number;
  typeFixed: number;
  ordersTouched: number;
}> {
  const exits = await prisma.orderExit.findMany({
    select: {
      orderId: true,
      invoiceNumber: true,
      exitDate: true,
      order: {
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          invoiceNumber: true,
          items: {
            select: {
              id: true,
              sku: true,
              productId: true,
              quantity: true,
              pickedQty: true,
              invoicedQty: true,
            },
          },
        },
      },
    },
  });

  let created = 0;
  let typeFixed = 0;
  let ordersTouched = 0;

  for (const exit of exits) {
    const order = exit.order;
    const inv =
      order.invoiceNumber?.trim() || exit.invoiceNumber.trim() || null;
    const movementWhere = buildOrderMovementWhere({
      code: order.code,
      externalOrderNumber: order.externalOrderNumber,
      invoiceNumber: inv,
    });

    const existing = await prisma.stockMovement.findMany({
      where: {
        AND: [
          movementWhere,
          { movementType: { in: EXIT_OUTBOUND_TYPES } },
        ],
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        movementType: true,
      },
    });

    const byProduct = new Map<string, typeof existing>();
    for (const m of existing) {
      const list = byProduct.get(m.productId) ?? [];
      list.push(m);
      byProduct.set(m.productId, list);
    }

    /** Soma invoicedQty (fallback: picked) por productId. */
    const expectedByProduct = new Map<
      string,
      { qty: number; skuSample: string }
    >();
    for (const item of order.items) {
      const qtyOut =
        item.invoicedQty > 0 ? item.invoicedQty : resolveExitQty(item);
      if (qtyOut <= 0) continue;

      const productId = await resolveProductId(item);
      if (!productId) {
        console.warn(
          `[stock] ${order.code} item ${item.sku}: sem productId — pulado`,
        );
        continue;
      }

      const cur = expectedByProduct.get(productId);
      if (cur) {
        cur.qty += qtyOut;
      } else {
        expectedByProduct.set(productId, {
          qty: qtyOut,
          skuSample: item.sku,
        });
      }
    }

    let touched = false;

    for (const [productId, expected] of expectedByProduct) {
      const linked = byProduct.get(productId) ?? [];
      const saida = linked.find(
        (m) => m.movementType === StockMovementType.SAIDA_EXPEDICAO,
      );
      const wrong = linked.find(
        (m) =>
          m.movementType === StockMovementType.OUTBOUND ||
          m.movementType === StockMovementType.BAIXA_EXPEDICAO,
      );

      if (saida) {
        continue;
      }

      const notes = `Saída pedido ${order.code}${inv ? ` · NF ${inv}` : ''} (corrigido retroativamente)`;

      if (wrong) {
        await prisma.stockMovement.update({
          where: { id: wrong.id },
          data: {
            movementType: StockMovementType.SAIDA_EXPEDICAO,
            quantity: expected.qty,
            reference: order.code,
            invoiceNumber: inv,
            notes,
          },
        });
        typeFixed += 1;
        touched = true;
        console.log(
          `[stock] ${order.code} SKU ${expected.skuSample}: ${wrong.movementType} → SAIDA_EXPEDICAO (qty ${expected.qty})`,
        );
        continue;
      }

      await prisma.stockMovement.create({
        data: {
          productId,
          movementType: StockMovementType.SAIDA_EXPEDICAO,
          quantity: expected.qty,
          reference: order.code,
          invoiceNumber: inv,
          notes,
          movementDate: exit.exitDate,
        },
      });
      created += 1;
      touched = true;
      console.log(
        `[stock] ${order.code} SKU ${expected.skuSample}: criado SAIDA_EXPEDICAO qty ${expected.qty}`,
      );
    }

    if (touched) ordersTouched += 1;
  }

  console.log(
    `[stock] Movimentações criadas: ${created}; tipos corrigidos: ${typeFixed}; pedidos tocados: ${ordersTouched}`,
  );
  return { created, typeFixed, ordersTouched };
}

async function main() {
  loadEnvFile();
  console.log('=== fix-partial-orders ===');
  try {
    const partialFixed = await fixPartialOrders();
    const stock = await fixMissingExitMovements();
    console.log('=== resumo ===');
    console.log(`Pedidos FINALIZADO → PARCIAL: ${partialFixed}`);
    console.log(`StockMovement criados: ${stock.created}`);
    console.log(`StockMovement tipo corrigido: ${stock.typeFixed}`);
    console.log(`Pedidos com ajuste de estoque: ${stock.ordersTouched}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
