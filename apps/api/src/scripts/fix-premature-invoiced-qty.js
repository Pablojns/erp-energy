/**
 * Destrava pedidos em que attachInvoice antecipou invoicedQty (= pickedQty)
 * sem OrderExit correspondente — bloqueando a saída com
 * "Nenhuma quantidade nova separada".
 *
 * Uso (apps/api):
 *   node src/scripts/fix-premature-invoiced-qty.js [numeroPed]
 *   node src/scripts/fix-premature-invoiced-qty.js 4518884234
 */
const path = require('path');
const fs = require('fs');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(path.join(__dirname, '../../../.env'));
loadEnv(path.join(__dirname, '../../../packages/database/.env'));
loadEnv(path.join(__dirname, '../../.env'));

const targetPed = (process.argv[2] || '4518884234').trim();

(async () => {
  const { prisma } = require('@erp/database');

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { externalOrderNumber: targetPed },
        { externalOrderNumber: `#${targetPed}` },
        { code: targetPed },
      ],
    },
    include: {
      items: true,
      exits: { select: { id: true, invoiceNumber: true, exitDate: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!order) {
    console.error('Pedido não encontrado:', targetPed);
    process.exit(1);
  }

  console.log('ANTES', {
    id: order.id,
    code: order.code,
    externalOrderNumber: order.externalOrderNumber,
    status: order.status,
    invoiceNumber: order.invoiceNumber,
    exits: order.exits.length,
    items: order.items.map((i) => ({
      sku: i.sku,
      quantity: i.quantity,
      pickedQty: i.pickedQty,
      invoicedQty: i.invoicedQty,
      pending: Math.max(0, (i.pickedQty ?? 0) - (i.invoicedQty ?? 0)),
    })),
  });

  // Sem saída registrada: qualquer invoicedQty antecipado é inválido.
  // Com saídas: o piso legítimo é o que já saiu; se invoicedQty > soma das
  // saídas reais no item, isso é mais complexo — para o caso sem exits, zera.
  if (order.exits.length === 0) {
    for (const it of order.items) {
      if ((it.invoicedQty ?? 0) > 0) {
        await prisma.orderItem.update({
          where: { id: it.id },
          data: { invoicedQty: 0 },
        });
        console.log(
          `RESET invoicedQty ${it.sku}: ${it.invoicedQty} → 0 (pickedQty=${it.pickedQty})`,
        );
      }
    }
  } else {
    console.log(
      'Pedido já tem OrderExit — não zera invoicedQty automaticamente.',
    );
  }

  const after = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true, exits: true },
  });
  console.log('DEPOIS', {
    status: after.status,
    items: after.items.map((i) => ({
      sku: i.sku,
      quantity: i.quantity,
      pickedQty: i.pickedQty,
      invoicedQty: i.invoicedQty,
      pending: Math.max(0, (i.pickedQty ?? 0) - (i.invoicedQty ?? 0)),
    })),
  });

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
