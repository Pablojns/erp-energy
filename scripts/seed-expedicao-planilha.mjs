/**
 * Cadastra produtos (estoque 150) e pedidos WEG da planilha de teste.
 * Uso: node scripts/seed-expedicao-planilha.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3001';
const TARGET_STOCK = 150;

const PRODUCTS = [
  { sku: '50141682', name: 'GARRAFA PLASTICO AZUL', price: 16.66 },
  { sku: '50022680', name: 'PASTA 90.5 - WELCOME PAPELAO AZUL ESCURO', price: 10.87 },
  { sku: '50020098', name: 'CANETA CROWN METAL PT', price: 78.12 },
  { sku: '50019096', name: 'SACOLA PADRAO BRANDING P PAPELAO', price: 11.92 },
  { sku: '50019097', name: 'CANETA PLASTICA', price: 16.56 },
  { sku: '50019983', name: 'CORDAO P/ CRACHA - 15MM', price: 35.51 },
  { sku: '50019098', name: 'BLOCO RASCUNHO P PAPEL BRANCO PT', price: 35.51 },
  { sku: '50141550', name: 'CADERNO A6 FOLHA LISA', price: 64.28 },
  { sku: '50043487', name: 'BONE BRIM AZUL', price: 28.31 },
  { sku: '50141535', name: 'CANETA METALICA EMBORRACHADA', price: 27.38 },
  { sku: '50020124', name: 'CADERNO PADRAO BRANDING PAPEL', price: 24.22 },
];

/** @type {Array<Record<string, unknown>>} */
const ORDERS = [
  {
    externalOrderNumber: '4518518586',
    orderDate: '2026-04-29',
    requestedDeliveryDate: '2026-04-29',
    deliveryCnpj: '07.175.725/0010-50',
    receiverName: 'Reginaldo',
    unloadingPoint: 'RUA 215 PRÉDIO 20/R:6471',
    total: 1666,
    items: [{ lineNumber: 10, sku: '50141682', description: 'GARRAFA PLASTICO AZUL', quantity: 100 }],
  },
  {
    externalOrderNumber: '4510650656',
    orderDate: '2026-05-11',
    requestedDeliveryDate: '2026-05-27',
    deliveryCnpj: '07.175.725/0010-50',
    receiverName: 'danielMKT',
    unloadingPoint: 'Prédio 59 - ADM WID/WMO',
    total: 1087.1,
    items: [
      {
        lineNumber: 20,
        sku: '50022680',
        description: 'PASTA 90.5 - WELCOME PAPELAO AZUL ESCURO',
        quantity: 100,
      },
    ],
  },
  {
    externalOrderNumber: '4518699849',
    orderDate: '2026-05-06',
    requestedDeliveryDate: '2026-04-29',
    deliveryCnpj: '07.175.725/0010-50',
    receiverName: 'Reginaldo',
    unloadingPoint: 'RUA 215 PRÉDIO 20/R:6471',
    total: 7812,
    items: [{ lineNumber: 10, sku: '50020098', description: 'CANETA CROWN METAL PT', quantity: 100 }],
  },
  {
    externalOrderNumber: '4518746213',
    orderDate: '2026-05-05',
    requestedDeliveryDate: '2026-05-25',
    deliveryCnpj: '07.175.725/0010-50',
    receiverName: 'GraceRissini',
    unloadingPoint: 'Prédio 60 MARKETING WEN',
    total: 3577,
    items: [
      { lineNumber: 10, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
      { lineNumber: 20, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
      { lineNumber: 30, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518767920',
    orderDate: '2026-05-13',
    requestedDeliveryDate: '2026-06-01',
    deliveryCnpj: '07.175.725/0010-50',
    receiverName: 'Reginaldo7959',
    unloadingPoint: 'prédio 20 WEX PFII Extens',
    total: 1656.1,
    items: [
      { lineNumber: 20, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
      { lineNumber: 30, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518334654',
    orderDate: '2026-03-12',
    requestedDeliveryDate: '2026-03-23',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '72317-000',
    total: 492,
    items: [{ lineNumber: 10, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 }],
  },
  {
    externalOrderNumber: '4518490015',
    orderDate: '2026-03-23',
    requestedDeliveryDate: '2026-03-25',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '09540-100',
    total: 3551,
    items: [
      { lineNumber: 10, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
      { lineNumber: 20, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
      { lineNumber: 30, sku: '50019983', description: 'CORDAO P/ CRACHA - 15MM', quantity: 100 },
      { lineNumber: 40, sku: '50019098', description: 'BLOCO RASCUNHO P PAPEL BRANCO PT', quantity: 100 },
      { lineNumber: 50, sku: '50141682', description: 'GARRAFA PLASTICO AZUL', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518533398',
    orderDate: '2026-05-08',
    requestedDeliveryDate: '2026-05-15',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '20550-018',
    total: 1016,
    items: [
      { lineNumber: 10, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
      { lineNumber: 20, sku: '50019098', description: 'BLOCO RASCUNHO P PAPEL BRANCO PT', quantity: 100 },
      { lineNumber: 30, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518548256',
    orderDate: '2026-04-23',
    requestedDeliveryDate: '2026-05-07',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: 'Prédio 58, MKT WAU',
    total: 805,
    items: [{ lineNumber: 10, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 }],
  },
  {
    externalOrderNumber: '4510669951',
    orderDate: '2026-04-29',
    requestedDeliveryDate: '2026-05-05',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '14805-347',
    total: 10211,
    items: [{ lineNumber: 10, sku: '50141682', description: 'GARRAFA PLASTICO AZUL', quantity: 100 }],
  },
  {
    externalOrderNumber: '4518730511',
    orderDate: '2026-05-08',
    requestedDeliveryDate: '2026-05-18',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '88200-000',
    total: 6427.7,
    items: [
      { lineNumber: 30, sku: '50141550', description: 'CADERNO A6 FOLHA LISA', quantity: 100 },
      { lineNumber: 50, sku: '50043487', description: 'BONE BRIM AZUL', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518739012',
    orderDate: '2026-05-05',
    requestedDeliveryDate: '2026-05-15',
    deliveryCnpj: '07.175.725/0012-12',
    receiverName: 'Marilia 4604',
    unloadingPoint: '14050-810',
    total: 2084,
    items: [
      { lineNumber: 10, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
      { lineNumber: 20, sku: '50043487', description: 'BONE BRIM AZUL', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518862635',
    orderDate: '2026-04-27',
    requestedDeliveryDate: '2026-04-30',
    deliveryCnpj: '14.309.992/0001-48',
    receiverName: 'Marilia 4604',
    unloadingPoint: '38700-002',
    total: 2830.75,
    items: [
      { lineNumber: 10, sku: '50019097', description: 'CANETA PLASTICA', quantity: 100 },
      { lineNumber: 20, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
      { lineNumber: 40, sku: '50043487', description: 'BONE BRIM AZUL', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518698211',
    orderDate: '2026-04-24',
    requestedDeliveryDate: '2026-05-05',
    deliveryCnpj: '60.621.141/0008-63',
    receiverName: 'Giovanna',
    unloadingPoint: 'Recursos Humanos',
    total: 566,
    items: [
      { lineNumber: 10, sku: '50019096', description: 'SACOLA PADRAO BRANDING P PAPELAO', quantity: 100 },
    ],
  },
  {
    externalOrderNumber: '4518249493',
    orderDate: '2026-04-29',
    requestedDeliveryDate: '2026-05-18',
    deliveryCnpj: '84.584.994/0007-16',
    receiverName: 'HENRIQUE',
    unloadingPoint: 'MKT',
    total: 2738,
    items: [
      {
        lineNumber: 20,
        sku: '50141535',
        description: 'CANETA METALICA EMBORRACHADA',
        quantity: 100,
      },
    ],
  },
];

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body?.message
        ? Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message
        : text;
    throw new Error(`${options.method ?? 'GET'} ${path} → ${res.status}: ${msg}`);
  }
  return body;
}

function unitPriceForOrder(order, item) {
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  return Number((order.total / totalQty).toFixed(2));
}

async function findProductBySku(sku) {
  const page = await api(`/products?search=${encodeURIComponent(sku)}&pageSize=100`);
  const hit = page.data?.find((p) => p.sku === sku);
  return hit ?? null;
}

async function ensureProduct({ sku, name, price }) {
  let product = await findProductBySku(sku);
  if (!product) {
    product = await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        sku,
        name,
        price,
        minStock: 10,
        category: 'WEG',
      }),
    });
    console.log(`  + Produto criado: ${sku}`);
  } else {
    console.log(`  = Produto existe: ${sku}`);
  }

  const current = product.stockQty ?? 0;
  if (current < TARGET_STOCK) {
    const delta = TARGET_STOCK - current;
    await api('/stock/movements', {
      method: 'POST',
      body: JSON.stringify({
        productId: product.id,
        movementKind: 'entrada',
        quantity: delta,
        reference: 'Seed planilha expedição',
        notes: `Ajuste para ${TARGET_STOCK} un.`,
      }),
    });
    console.log(`  ↑ Estoque ${sku}: ${current} → ${TARGET_STOCK}`);
  } else {
    console.log(`  ✓ Estoque ${sku}: ${current} (>= ${TARGET_STOCK})`);
  }
  return product;
}

async function orderExists(externalOrderNumber) {
  const res = await api(
    `/orders?externalOrderNumber=${encodeURIComponent(externalOrderNumber)}&pageSize=5`,
  );
  return (res.data ?? []).some(
    (o) => o.externalOrderNumber === externalOrderNumber,
  );
}

async function createOrder(order) {
  if (await orderExists(order.externalOrderNumber)) {
    console.log(`  = Pedido já existe: #${order.externalOrderNumber}`);
    return;
  }

  const items = order.items.map((it) => ({
    ...it,
    unit: 'UN',
    ncm: '0000.00.00',
    unitPrice: unitPriceForOrder(order, it),
  }));

  await api('/orders', {
    method: 'POST',
    body: JSON.stringify({
      externalOrderNumber: order.externalOrderNumber,
      customerName: `Cliente WEG (${order.deliveryCnpj})`,
      deliveryCnpj: order.deliveryCnpj,
      receiverName: order.receiverName,
      unloadingPoint: order.unloadingPoint,
      deliveryAddress: order.unloadingPoint,
      orderDate: order.orderDate,
      requestedDeliveryDate: order.requestedDeliveryDate,
      mercadoEletronicoStatus: 'Sem recebimento',
      contaAzulStatus: 'Não Encontrado',
      notes: 'Importado da planilha de teste',
      items,
    }),
  });
  console.log(`  + Pedido criado: #${order.externalOrderNumber} (${items.length} itens)`);
}

async function main() {
  console.log(`API: ${API}\n--- Produtos e estoque ---`);
  for (const p of PRODUCTS) {
    await ensureProduct(p);
  }

  console.log('\n--- Pedidos WEG ---');
  for (const o of ORDERS) {
    await createOrder(o);
  }

  console.log('\nConcluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
