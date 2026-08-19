const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Código de objeto Correios (ex.: AP373095360BR). */
function isCorreiosTrackingCode(raw) {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '');
  return /^[A-Z]{2}\d{8,11}BR$/.test(code);
}

function normalizeTracking(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const orders = await prisma.order.findMany({
    where: { invoiceNumber: { not: null } },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      invoiceNumber: true,
      trackingCode: true,
    },
  });
  const affectedOrders = orders.filter((row) =>
    isCorreiosTrackingCode(row.invoiceNumber),
  );

  const exits = await prisma.orderExit.findMany({
    select: {
      id: true,
      orderId: true,
      invoiceNumber: true,
      trackingCode: true,
    },
  });
  const affectedExits = exits.filter((row) =>
    isCorreiosTrackingCode(row.invoiceNumber),
  );

  const history = await prisma.orderInvoiceHistory.findMany({
    select: { id: true, orderId: true, invoiceNumber: true },
  });
  const affectedHistory = history.filter((row) =>
    isCorreiosTrackingCode(row.invoiceNumber),
  );

  console.log(
    JSON.stringify(
      {
        dryRun,
        orders: affectedOrders.length,
        exits: affectedExits.length,
        history: affectedHistory.length,
        sample: affectedOrders.slice(0, 20).map((row) => ({
          code: row.code,
          externalOrderNumber: row.externalOrderNumber,
          invoiceNumber: row.invoiceNumber,
          trackingCode: row.trackingCode,
        })),
      },
      null,
      2,
    ),
  );

  if (dryRun) return;

  let ordersFixed = 0;
  for (const row of affectedOrders) {
    const tracking = normalizeTracking(row.invoiceNumber);
    const currentTracking = row.trackingCode?.trim() || '';
    const nextTracking =
      !currentTracking || isCorreiosTrackingCode(currentTracking)
        ? tracking
        : currentTracking;
    await prisma.order.update({
      where: { id: row.id },
      data: {
        trackingCode: nextTracking,
        invoiceNumber: null,
      },
    });
    ordersFixed += 1;
  }

  let exitsFixed = 0;
  for (const row of affectedExits) {
    const tracking = normalizeTracking(row.invoiceNumber);
    const currentTracking = row.trackingCode?.trim() || '';
    const nextTracking =
      !currentTracking || isCorreiosTrackingCode(currentTracking)
        ? tracking
        : currentTracking;
    await prisma.orderExit.update({
      where: { id: row.id },
      data: {
        trackingCode: nextTracking,
        invoiceNumber: '',
      },
    });
    exitsFixed += 1;
  }

  const historyDeleted =
    affectedHistory.length === 0
      ? 0
      : (
          await prisma.orderInvoiceHistory.deleteMany({
            where: { id: { in: affectedHistory.map((row) => row.id) } },
          })
        ).count;

  console.log(
    JSON.stringify({ ordersFixed, exitsFixed, historyDeleted }, null, 2),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
