import { prisma } from '@erp/database';

async function main() {
  const rows = await prisma.orderInvoiceHistory.findMany({
    where: {
      OR: [
        { xmlStorageKey: { not: null } },
        { danfeStorageKey: { not: null } },
      ],
    },
    take: 10,
    select: {
      invoiceNumber: true,
      xmlStorageKey: true,
      danfeStorageKey: true,
      order: {
        select: {
          externalOrderNumber: true,
          customerName: true,
          customer: { select: { email: true, document: true } },
        },
      },
    },
  });
  console.log(
    rows.map((r) => ({
      nf: r.invoiceNumber,
      pedido: r.order.externalOrderNumber,
      customer: r.order.customerName,
      email: r.order.customer?.email,
      xml: Boolean(r.xmlStorageKey),
      danfe: Boolean(r.danfeStorageKey),
    })),
  );
  console.log('total with keys', rows.length);
  await prisma.$disconnect();
}

main();
