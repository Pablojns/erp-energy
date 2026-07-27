const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const code = '4518489555';
  const tracking = 'AP269423083BR';
  const order = await prisma.order.findFirst({
    where: { OR: [{ externalOrderNumber: code }, { code }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      code: true,
      externalOrderNumber: true,
      trackingCode: true,
    },
  });
  if (!order) {
    console.log('ORDER_NOT_FOUND');
    process.exitCode = 1;
    return;
  }
  console.log('BEFORE', JSON.stringify(order));
  await prisma.order.update({
    where: { id: order.id },
    data: { trackingCode: tracking },
  });
  const exit = await prisma.orderExit.findUnique({
    where: { orderId: order.id },
    select: { id: true, trackingCode: true },
  });
  if (exit) {
    await prisma.orderExit.update({
      where: { id: exit.id },
      data: { trackingCode: tracking },
    });
    console.log('EXIT_UPDATED', exit.id);
  } else {
    console.log('NO_EXIT');
  }
  const after = await prisma.order.findUnique({
    where: { id: order.id },
    select: { trackingCode: true },
  });
  const exitAfter = await prisma.orderExit.findUnique({
    where: { orderId: order.id },
    select: { trackingCode: true },
  });
  console.log('AFTER', JSON.stringify({ order: after, exit: exitAfter }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
