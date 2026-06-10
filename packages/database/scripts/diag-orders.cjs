const { prisma } = require('../dist/index.js');

async function main() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "externalOrderNumber", "mercadoEletronicoStatus", "contaAzulStatus", "status", "customerName"
    FROM "Order"
    ORDER BY "createdAt" DESC
    LIMIT 20
  `);
  console.log(JSON.stringify(rows, null, 2));

  const total = await prisma.order.count();
  const filaExact = await prisma.order.count({
    where: { mercadoEletronicoStatus: 'Sem recebimento' },
  });
  const meNull = await prisma.order.count({
    where: { mercadoEletronicoStatus: null },
  });
  const meEmpty = await prisma.order.count({
    where: { mercadoEletronicoStatus: '' },
  });

  const distinct = await prisma.order.findMany({
    select: { mercadoEletronicoStatus: true },
    distinct: ['mercadoEletronicoStatus'],
    take: 30,
  });

  console.log('\nCounts:', { total, filaExact, meNull, meEmpty });
  console.log('\nDistinct mercadoEletronicoStatus:', distinct.map((d) => d.mercadoEletronicoStatus));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
