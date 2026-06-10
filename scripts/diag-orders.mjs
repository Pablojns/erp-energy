import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const rows = await prisma.$queryRaw`
  SELECT "externalOrderNumber", "mercadoEletronicoStatus", "contaAzulStatus", "status", "customerName"
  FROM "Order"
  ORDER BY "createdAt" DESC
  LIMIT 20
`;

console.log(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

const countFila = await prisma.order.count({
  where: { mercadoEletronicoStatus: 'Sem recebimento' },
});
const countAll = await prisma.order.count();
const countNullMe = await prisma.order.count({
  where: { mercadoEletronicoStatus: null },
});

console.log('\nCounts:', { total: countAll, filaExact: countFila, meNull: countNullMe });

await prisma.$disconnect();
