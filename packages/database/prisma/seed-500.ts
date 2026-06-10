import {
  InvoiceStatus,
  OrderItemStockStatus,
  OrderSource,
  OrderStatus,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const RECEIVERS = ['GraceRissini', 'Marilia 4604', 'HENRIQUE', 'danielMKT', 'Reginaldo'];
const POINTS = ['MKT', 'Prédio 60 WEN', 'Prédio 59 ADM', 'Recursos Humanos', '88200-000'];
const FALLBACK_SKUS = [
  { sku: '50019097', description: 'ITEM TESTE 50019097' },
  { sku: '50020124', description: 'ITEM TESTE 50020124' },
  { sku: '50030207', description: 'ITEM TESTE 50030207' },
];

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sample<T>(arr: T[]): T {
  return arr[rand(0, arr.length - 1)];
}

function randomDateInPastDays(days: number): Date {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - rand(0, days));
  d.setHours(rand(0, 23), rand(0, 59), rand(0, 59), 0);
  return d;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function dec2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function ensureFallbackProducts() {
  for (const [idx, row] of FALLBACK_SKUS.entries()) {
    await prisma.product.upsert({
      where: { sku: row.sku },
      update: { name: row.description, isActive: true },
      create: {
        internalCode: `SEED-${row.sku}-${idx + 1}`,
        sku: row.sku,
        name: row.description,
        description: row.description,
        price: 50 + idx * 10,
        cost: 20 + idx * 5,
        minStock: 5,
        stockQty: 2000,
        reservedQty: 0,
        isActive: true,
      },
    });
  }
}

async function main() {
  await ensureFallbackProducts();

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, price: true, cost: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  if (products.length === 0) {
    throw new Error('Nenhum produto ativo encontrado para seed.');
  }

  let createdOrders = 0;
  let createdItems = 0;
  let seq = 4519000001;

  const plan: Array<{ status: OrderStatus; count: number; kind: 'complete' | 'pending' | 'separation' }> = [
    { status: OrderStatus.FINALIZADO, count: 460, kind: 'complete' },
    { status: OrderStatus.NOVO, count: 30, kind: 'pending' },
    { status: OrderStatus.EM_SEPARACAO, count: 10, kind: 'separation' },
  ];

  for (const group of plan) {
    for (let i = 0; i < group.count; i += 1) {
      const externalOrderNumber = String(seq);
      seq += 1;

      const orderDate = randomDateInPastDays(90);
      let requestedDeliveryDate: Date;
      if (group.kind === 'complete') {
        requestedDeliveryDate = addDays(orderDate, -rand(1, 30));
      } else {
        const overdue = Math.random() < 0.6;
        requestedDeliveryDate = overdue
          ? addDays(new Date(), -rand(1, 20))
          : addDays(new Date(), rand(1, 20));
      }

      const itemCount = rand(1, 3);
      const items: Array<{
        lineNumber: number;
        productId: string;
        sku: string;
        description: string;
        quantity: number;
        pickedQty: number;
        unitPrice: number;
        totalPrice: number;
        stockStatus: OrderItemStockStatus;
      }> = [];

      for (let line = 1; line <= itemCount; line += 1) {
        const product = sample(products);
        const quantity = rand(1, 200);
        const pickedQty = group.kind === 'complete' ? quantity : 0;
        const unitPrice = dec2(rand(50, 5000) + Math.random());
        const totalPrice = dec2(unitPrice * quantity);
        items.push({
          lineNumber: line,
          productId: product.id,
          sku: product.sku,
          description: product.name,
          quantity,
          pickedQty,
          unitPrice,
          totalPrice,
          stockStatus:
            group.kind === 'complete'
              ? OrderItemStockStatus.COMPLETO
              : OrderItemStockStatus.NAO_ANALISADO,
        });
      }

      const subtotal = dec2(items.reduce((acc, it) => acc + it.totalPrice, 0));
      const totalValue = subtotal;

      await prisma.order.create({
        data: {
          source: OrderSource.WEG_MERCADO_ELETRONICO,
          code: `PED-SEED-${externalOrderNumber}`,
          externalOrderNumber,
          customerName: `Cliente Seed ${rand(1000, 9999)}`,
          customerDocument: null,
          receiverName: sample(RECEIVERS),
          unloadingPoint: sample(POINTS),
          deliveryCnpj: '07.175.725/0010-50',
          deliveryCity: 'Jaraguá do Sul',
          deliveryState: 'SC',
          deliveryAddress: null,
          notes: null,
          status: group.status,
          priority: group.kind === 'pending' ? 2 : 3,
          mercadoEletronicoStatus: 'Sem recebimento',
          contaAzulStatus: null,
          invoiceNumber: null,
          invoiceStatus: InvoiceStatus.NOT_FOUND,
          orderDate,
          requestedDeliveryDate,
          subtotal,
          discount: 0,
          total: totalValue,
          totalValue,
          shippedAt: group.kind === 'complete' ? addDays(orderDate, 1) : null,
          items: {
            create: items.map((it) => ({
              lineNumber: it.lineNumber,
              productId: it.productId,
              sku: it.sku,
              description: it.description,
              quantity: it.quantity,
              reservedQuantity: group.kind === 'complete' ? it.quantity : 0,
              missingQty: 0,
              pickedQty: it.pickedQty,
              invoicedQty: group.kind === 'complete' ? it.quantity : 0,
              stockStatus: it.stockStatus,
              unit: 'UN',
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
              discount: 0,
            })),
          },
        },
      });

      createdOrders += 1;
      createdItems += itemCount;
    }
  }

  console.log(`Seed concluído: ${createdOrders} pedidos e ${createdItems} itens criados.`);
}

main()
  .catch((err) => {
    console.error('Falha no seed-500:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
