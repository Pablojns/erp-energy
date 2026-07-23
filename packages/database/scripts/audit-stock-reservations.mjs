/**
 * Reconstrói Product.reservedQty a partir de StockReservation ativas e
 * pedidos não finalizados; preenche orderNumber onde faltar.
 *
 * Uso (na raiz do monorepo, com DATABASE_URL carregado):
 *   node packages/database/scripts/audit-stock-reservations.mjs
 *   node packages/database/scripts/audit-stock-reservations.mjs --apply
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
const { PrismaClient, OrderStatus } = createRequire(import.meta.url)(
  '@prisma/client',
);
const prisma = new PrismaClient();

const TERMINAL = new Set([
  OrderStatus.FINALIZADO,
  OrderStatus.CANCELADO,
  OrderStatus.EXPEDIDO,
]);

function orderNumber(order) {
  const ext = order.externalOrderNumber?.trim();
  return ext || order.code;
}

async function main() {
  console.log(apply ? 'MODO APPLY' : 'MODO DRY-RUN (passe --apply para gravar)');

  // 1) Marca como liberadas reservas de pedidos já terminais (se ainda ativas).
  const staleActive = await prisma.stockReservation.findMany({
    where: {
      releasedAt: null,
      order: { status: { in: [...TERMINAL] } },
    },
    include: {
      order: { select: { id: true, code: true, status: true } },
    },
  });
  console.log(
    `Reservas ativas em pedidos terminais: ${staleActive.length}`,
  );
  if (apply && staleActive.length) {
    await prisma.stockReservation.updateMany({
      where: { id: { in: staleActive.map((r) => r.id) } },
      data: { releasedAt: new Date() },
    });
  }

  // 2) Garante StockReservation ativa para itens com reservedQuantity > 0
  //    em pedidos não terminais (e com productId).
  const openItems = await prisma.orderItem.findMany({
    where: {
      reservedQuantity: { gt: 0 },
      productId: { not: null },
      order: { status: { notIn: [...TERMINAL] } },
    },
    include: {
      order: {
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          status: true,
        },
      },
      stockReservation: true,
    },
  });

  let created = 0;
  let reactivated = 0;
  let numbered = 0;

  for (const item of openItems) {
    const productId = item.productId;
    if (!productId) continue;
    const on = orderNumber(item.order);
    const existing = item.stockReservation;

    if (!existing) {
      created += 1;
      if (apply) {
        await prisma.stockReservation.create({
          data: {
            orderId: item.orderId,
            orderItemId: item.id,
            productId,
            sku: item.sku,
            quantity: item.reservedQuantity,
            orderNumber: on,
            releasedAt: null,
          },
        });
      }
      continue;
    }

    if (existing.releasedAt) {
      reactivated += 1;
      if (apply) {
        await prisma.stockReservation.update({
          where: { id: existing.id },
          data: {
            quantity: item.reservedQuantity,
            productId,
            sku: item.sku,
            orderNumber: on,
            releasedAt: null,
            createdAt: new Date(),
          },
        });
      }
      continue;
    }

    // Ativa: sincroniza qty / orderNumber se divergir
    const patch = {};
    if (existing.quantity !== item.reservedQuantity) {
      patch.quantity = item.reservedQuantity;
    }
    if (!existing.orderNumber || existing.orderNumber !== on) {
      patch.orderNumber = on;
      numbered += 1;
    }
    if (Object.keys(patch).length && apply) {
      await prisma.stockReservation.update({
        where: { id: existing.id },
        data: patch,
      });
    } else if (patch.orderNumber && !apply) {
      numbered += 1;
    }
  }

  console.log(
    `Itens abertos com reservedQuantity>0: ${openItems.length} | criar: ${created} | reativar: ${reactivated} | orderNumber sync: ${numbered}`,
  );

  // 3) Preenche orderNumber faltante nas ativas restantes
  const missingNumber = await prisma.stockReservation.findMany({
    where: {
      releasedAt: null,
      OR: [{ orderNumber: null }, { orderNumber: '' }],
    },
    include: {
      order: { select: { code: true, externalOrderNumber: true } },
    },
  });
  console.log(`Ativas sem orderNumber: ${missingNumber.length}`);
  if (apply) {
    for (const r of missingNumber) {
      await prisma.stockReservation.update({
        where: { id: r.id },
        data: { orderNumber: orderNumber(r.order) },
      });
    }
  }

  // 4) Recalcula reservedQty de cada produto = soma das reservas ativas
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, reservedQty: true },
  });

  const sums = await prisma.stockReservation.groupBy({
    by: ['productId'],
    where: { releasedAt: null },
    _sum: { quantity: true },
  });
  const sumByProduct = new Map(
    sums.map((s) => [s.productId, s._sum.quantity ?? 0]),
  );

  let mismatches = 0;
  for (const p of products) {
    const expected = sumByProduct.get(p.id) ?? 0;
    if (p.reservedQty !== expected) {
      mismatches += 1;
      console.log(
        `  ${p.sku}: reservedQty ${p.reservedQty} → ${expected}`,
      );
      if (apply) {
        await prisma.product.update({
          where: { id: p.id },
          data: { reservedQty: expected },
        });
      }
    }
  }

  console.log(`Produtos com reservedQty divergente: ${mismatches}`);
  console.log(apply ? 'Aplicado.' : 'Dry-run concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
