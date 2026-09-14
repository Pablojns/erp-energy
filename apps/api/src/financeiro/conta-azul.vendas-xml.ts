import { stripAccents } from '../orders/order-search';
import { documentDigits } from './conta-azul.pessoas';
import { planVendaVinculos, type CaVenda } from './conta-azul.vendas';
import type { NfeXmlDados, NfeXmlItem } from './conta-azul.nfe-xml';

export type ErpOrderForXml = {
  id: string;
  code: string;
  source: string;
  externalOrderNumber: string | null;
  customerName: string;
  customerDocument: string | null;
  deliveryCnpj: string | null;
  invoiceNumber: string | null;
  notaRemessa: string | null;
  status: string;
  total: number;
  contaAzulVendaId: string | null;
  items: ErpOrderItemForXml[];
};

export type ErpOrderItemForXml = {
  id: string;
  lineNumber: number;
  sku: string;
  supplierMaterialCode: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  ncm: string | null;
  unitPrice: number;
  totalPrice: number;
  productId: string | null;
};

export type XmlVendaCaso = 'caso1' | 'caso2' | 'ambiguo';

export type XmlVendaClassificacao = {
  caso: XmlVendaCaso;
  via: 'contaAzulVendaId' | 'p1_claro' | 'invoiceNumber' | 'sem_pedido' | 'ambiguo';
  venda: CaVenda;
  order?: ErpOrderForXml;
  motivo?: string;
};

export type ItemFillPatch = {
  itemId: string;
  lineNumber: number;
  sku?: string;
  description?: string;
  unit?: string;
  ncm?: string;
  unitPrice?: number;
  totalPrice?: number;
};

export type ItemAddPatch = {
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  unit: string | null;
  ncm: string | null;
  unitPrice: number;
  totalPrice: number;
  productId: string | null;
};

export type Caso1Plan = {
  vendaId: string;
  vendaNumero: string | null;
  clienteNome: string | null;
  orderId: string;
  orderCode: string;
  externalOrderNumber: string | null;
  via: XmlVendaClassificacao['via'];
  invoiceNumber: string;
  fills: ItemFillPatch[];
  adds: ItemAddPatch[];
  preencherInvoice: boolean;
  preencherVendaId: boolean;
  perfeito: boolean;
  qtyDivergencias: number;
};

export type Caso2Plan = {
  vendaId: string;
  vendaNumero: string | null;
  clienteNome: string | null;
  cnpj: string | null;
  invoiceNumber: string;
  emitidaEm: string | null;
  total: number;
  items: ItemAddPatch[];
  customerId: string | null;
  customerName: string;
  deliveryAddress: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  companyEntityId: string | null;
  externalOrderNumber: string;
};

export type XmlVendaSkip = {
  vendaId: string;
  vendaNumero: string | null;
  clienteNome: string | null;
  motivo: string;
};

function normalizeSku(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+/, '');
}

function normalizeDesc(raw: string | null | undefined): string {
  return stripAccents(String(raw ?? '').trim().toLowerCase()).replace(/\s+/g, ' ');
}

export function isMissingMoney(value: number | null | undefined): boolean {
  const n = Number(value);
  return !Number.isFinite(n) || n === 0;
}

export function classifyXmlVendas(input: {
  vendas: CaVenda[];
  orders: ErpOrderForXml[];
}): XmlVendaClassificacao[] {
  const byVendaId = new Map<string, ErpOrderForXml>();
  for (const order of input.orders) {
    const id = String(order.contaAzulVendaId ?? '').trim();
    if (id && !byVendaId.has(id)) byVendaId.set(id, order);
  }
  const p1 = planVendaVinculos({
    vendas: input.vendas,
    orders: input.orders.map((o) => ({
      id: o.id,
      code: o.code,
      externalOrderNumber: o.externalOrderNumber,
      customerDocument: o.customerDocument,
      deliveryCnpj: o.deliveryCnpj,
      total: o.total,
      status: o.status,
      contaAzulVendaId: o.contaAzulVendaId,
    })),
  });
  const claroByVenda = new Map(p1.claros.map((row) => [row.vendaId, row]));
  const orderById = new Map(input.orders.map((o) => [o.id, o]));
  const semByVenda = new Map(p1.semCorrespondencia.map((row) => [row.vendaId, row]));

  return input.vendas.map((venda) => {
    const linked = byVendaId.get(venda.contaAzulId);
    if (linked) {
      return {
        caso: 'caso1',
        via: 'contaAzulVendaId',
        venda,
        order: linked,
      };
    }
    const claro = claroByVenda.get(venda.contaAzulId);
    if (claro) {
      const order = orderById.get(claro.orderId);
      return {
        caso: 'caso1',
        via: 'p1_claro',
        venda,
        order,
        motivo: `Match P1 claro (${claro.reason}) — completa o pedido existente, não cria outro`,
      };
    }
    const sem = semByVenda.get(venda.contaAzulId);
    const motivo = sem?.motivo ?? 'Sem pedido correspondente no ERP';
    if (/bateu com \d+/i.test(motivo)) {
      return { caso: 'ambiguo', via: 'ambiguo', venda, motivo };
    }
    return { caso: 'caso2', via: 'sem_pedido', venda, motivo };
  });
}

export function reclassifyByInvoice(input: {
  row: XmlVendaClassificacao;
  invoiceNumber: string | null;
  orders: ErpOrderForXml[];
}): XmlVendaClassificacao {
  if (input.row.caso !== 'caso2') return input.row;
  const wanted = String(input.invoiceNumber ?? '').replace(/\D/g, '').replace(/^0+/, '');
  if (!wanted) return input.row;
  const matches = input.orders.filter((o) => {
    const inv = String(o.invoiceNumber ?? '').replace(/\D/g, '').replace(/^0+/, '');
    return inv === wanted;
  });
  if (matches.length === 1) {
    return {
      caso: 'caso1',
      via: 'invoiceNumber',
      venda: input.row.venda,
      order: matches[0],
      motivo: `NF ${wanted} já existe no pedido ${matches[0].code} — completa itens, não duplica`,
    };
  }
  if (matches.length > 1) {
    return {
      caso: 'ambiguo',
      via: 'ambiguo',
      venda: input.row.venda,
      motivo: `NF ${wanted} existe em ${matches.length} pedidos do ERP`,
    };
  }
  return input.row;
}

function orderItemKeys(item: ErpOrderItemForXml): string[] {
  const keys = [normalizeSku(item.sku), normalizeSku(item.supplierMaterialCode)].filter(
    Boolean,
  );
  return [...new Set(keys)];
}

function pickUnused(
  items: ErpOrderItemForXml[],
  used: Set<string>,
  pred: (item: ErpOrderItemForXml) => boolean,
): ErpOrderItemForXml | undefined {
  return items.find((item) => !used.has(item.id) && pred(item));
}

export type ProductRef = { id: string; sku: string };

export function planCaso1Completar(input: {
  venda: CaVenda;
  order: ErpOrderForXml;
  xml: NfeXmlDados;
  via: XmlVendaClassificacao['via'];
  productsBySku?: Map<string, ProductRef>;
}): Caso1Plan {
  const used = new Set<string>();
  const fills: ItemFillPatch[] = [];
  const adds: ItemAddPatch[] = [];
  let qtyDivergencias = 0;
  const orderItems = [...input.order.items].sort((a, b) => a.lineNumber - b.lineNumber);
  let maxLine = orderItems.reduce((m, it) => Math.max(m, it.lineNumber), 0);

  for (const xmlItem of input.xml.items) {
    const skuKey = normalizeSku(xmlItem.sku);
    const descKey = normalizeDesc(xmlItem.description);
    const matched =
      (skuKey
        ? pickUnused(orderItems, used, (it) => orderItemKeys(it).includes(skuKey))
        : undefined) ??
      pickUnused(
        orderItems,
        used,
        (it) =>
          normalizeDesc(it.description) === descKey && it.quantity === xmlItem.quantity,
      ) ??
      pickUnused(
        orderItems,
        used,
        (it) => it.lineNumber === xmlItem.nItem || it.lineNumber === xmlItem.nItem * 10,
      );

    if (!matched) {
      maxLine += 10;
      adds.push(toAddPatch(xmlItem, maxLine, input.productsBySku));
      continue;
    }
    used.add(matched.id);
    if (matched.quantity !== xmlItem.quantity) qtyDivergencias += 1;
    const patch = diffFill(matched, xmlItem);
    if (patch) fills.push(patch);
  }

  const orderInvoiceDigits = String(input.order.invoiceNumber ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  const remessaDigits = String(input.order.notaRemessa ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  const invoiceVazio = !orderInvoiceDigits;
  const invoiceEhRemessa =
    Boolean(orderInvoiceDigits) &&
    Boolean(remessaDigits) &&
    orderInvoiceDigits === remessaDigits;
  const preencherInvoice =
    Boolean(input.xml.invoiceNumber) && (invoiceVazio || invoiceEhRemessa);
  const preencherVendaId = !String(input.order.contaAzulVendaId ?? '').trim();

  return {
    vendaId: input.venda.contaAzulId,
    vendaNumero: input.venda.numero,
    clienteNome: input.venda.clienteNome,
    orderId: input.order.id,
    orderCode: input.order.code,
    externalOrderNumber: input.order.externalOrderNumber,
    via: input.via,
    invoiceNumber: input.xml.invoiceNumber,
    fills,
    adds,
    preencherInvoice,
    preencherVendaId,
    perfeito:
      fills.length === 0 &&
      adds.length === 0 &&
      !preencherInvoice &&
      !preencherVendaId,
    qtyDivergencias,
  };
}

function diffFill(item: ErpOrderItemForXml, xml: NfeXmlItem): ItemFillPatch | null {
  const patch: ItemFillPatch = { itemId: item.id, lineNumber: item.lineNumber };
  let changed = false;
  if (!item.sku.trim() && xml.sku.trim()) {
    patch.sku = xml.sku.trim();
    changed = true;
  }
  if (!item.description.trim() && xml.description.trim()) {
    patch.description = xml.description.trim();
    changed = true;
  }
  if (!String(item.unit ?? '').trim() && xml.unit) {
    patch.unit = xml.unit;
    changed = true;
  }
  if (!String(item.ncm ?? '').trim() && xml.ncm) {
    patch.ncm = xml.ncm;
    changed = true;
  }
  if (isMissingMoney(item.unitPrice) && xml.unitPrice > 0) {
    patch.unitPrice = xml.unitPrice;
    changed = true;
  }
  if (isMissingMoney(item.totalPrice) && xml.totalPrice > 0) {
    patch.totalPrice = xml.totalPrice;
    changed = true;
  }
  return changed ? patch : null;
}

function toAddPatch(
  xml: NfeXmlItem,
  lineNumber: number,
  productsBySku?: Map<string, ProductRef>,
): ItemAddPatch {
  const sku = xml.sku.trim();
  const product =
    sku && productsBySku
      ? productsBySku.get(sku.toLowerCase()) ??
        productsBySku.get(normalizeSku(sku).toLowerCase())
      : undefined;
  return {
    lineNumber,
    sku,
    description: xml.description.trim(),
    quantity: xml.quantity,
    unit: xml.unit,
    ncm: xml.ncm,
    unitPrice: xml.unitPrice,
    totalPrice: xml.totalPrice,
    productId: product?.id ?? null,
  };
}

export function uniqueExternalOrderNumber(input: {
  venda: CaVenda;
  invoiceNumber: string;
  taken: Set<string>;
}): string {
  const candidates = [
    String(input.venda.numero ?? '').trim(),
    input.invoiceNumber ? `NF-${input.invoiceNumber}` : '',
    `CA-${input.venda.contaAzulId.replace(/-/g, '').slice(0, 12)}`,
  ].filter(Boolean);
  for (const raw of candidates) {
    if (!input.taken.has(raw.toLowerCase())) return raw;
  }
  return `CA-${input.venda.contaAzulId}`;
}

export function planCaso2Criar(input: {
  venda: CaVenda;
  xml: NfeXmlDados;
  takenExternal: Set<string>;
  customerId: string | null;
  companyEntityId: string | null;
  productsBySku?: Map<string, ProductRef>;
}): Caso2Plan {
  const invoiceNumber = input.xml.invoiceNumber;
  const externalOrderNumber = uniqueExternalOrderNumber({
    venda: input.venda,
    invoiceNumber,
    taken: input.takenExternal,
  });
  input.takenExternal.add(externalOrderNumber.toLowerCase());
  const items = input.xml.items.map((item, idx) =>
    toAddPatch(item, (idx + 1) * 10, input.productsBySku),
  );
  const customerName =
    input.xml.destNome?.trim() ||
    input.venda.clienteNome?.trim() ||
    'Cliente Conta Azul';
  return {
    vendaId: input.venda.contaAzulId,
    vendaNumero: input.venda.numero,
    clienteNome: input.venda.clienteNome,
    cnpj:
      input.xml.destDocumento ||
      documentDigits(input.venda.clienteDocumento) ||
      null,
    invoiceNumber,
    emitidaEm: input.xml.emitidaEm,
    total: input.xml.total || input.venda.total,
    items,
    customerId: input.customerId,
    customerName,
    deliveryAddress: input.xml.destEnderecoJson,
    deliveryCity: input.xml.destCidade,
    deliveryState: input.xml.destUf,
    companyEntityId: input.companyEntityId,
    externalOrderNumber,
  };
}

export function buildProductSkuMap(
  products: Array<{
    id: string;
    sku: string;
    internalCode?: string | null;
    supplierSku?: string | null;
  }>,
): Map<string, ProductRef> {
  const map = new Map<string, ProductRef>();
  const set = (key: string | null | undefined, ref: ProductRef) => {
    const k = String(key ?? '').trim().toLowerCase();
    if (k && !map.has(k)) map.set(k, ref);
    const norm = normalizeSku(key).toLowerCase();
    if (norm && !map.has(norm)) map.set(norm, ref);
  };
  for (const p of products) {
    const ref = { id: p.id, sku: p.sku };
    set(p.sku, ref);
    set(p.internalCode, ref);
    set(p.supplierSku, ref);
  }
  return map;
}
