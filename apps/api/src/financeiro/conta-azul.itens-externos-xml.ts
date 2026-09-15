import { stripAccents } from '../orders/order-search';
import type { NfeXmlItem } from './conta-azul.nfe-xml';

export type XmlCorrectionOrderItem = {
  id: string;
  lineNumber: number;
  sku: string;
  description: string;
  quantity: number;
  productId: string | null;
  productName: string | null;
  unitPrice: number;
  ncm?: string | null;
  unit?: string | null;
};

export type ExternalItemRef = {
  id: string;
  name: string;
};

export type ItemReplacePatch = {
  itemId: string;
  lineNumber: number;
  fromDescription: string;
  toDescription: string;
  fromSku: string;
  toSku: string;
  productId: string | null;
  productName: string | null;
  unitPrice: number;
  ncm: string | null;
  unit: string | null;
  externalItemName: string;
  reuseExternalItemId: string | null;
};

export function normalizeItemName(raw: string | null | undefined): string {
  return stripAccents(String(raw ?? '').trim().toLowerCase()).replace(/\s+/g, ' ');
}

/** Nome “parecido”: igual após normalizar, ou Jaccard de palavras ≥ 0,6. */
export function namesLookSimilar(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const words = (s: string) =>
    new Set(s.split(' ').filter((w) => w.length > 2));
  const wa = words(na);
  const wb = words(nb);
  if (wa.size === 0 || wb.size === 0) return false;
  let inter = 0;
  for (const w of wa) {
    if (wb.has(w)) inter += 1;
  }
  const union = wa.size + wb.size - inter;
  return union > 0 && inter / union >= 0.6;
}

export function findSimilarExternalItem(
  name: string,
  catalog: ExternalItemRef[],
): ExternalItemRef | null {
  const exact = catalog.find((row) => namesLookSimilar(row.name, name) && normalizeItemName(row.name) === normalizeItemName(name));
  if (exact) return exact;
  return catalog.find((row) => namesLookSimilar(row.name, name)) ?? null;
}

function pickUnused(
  items: XmlCorrectionOrderItem[],
  used: Set<string>,
  pred: (item: XmlCorrectionOrderItem) => boolean,
): XmlCorrectionOrderItem | undefined {
  return items.find((item) => !used.has(item.id) && pred(item));
}

function matchXmlToOrderItem(
  xmlItem: NfeXmlItem,
  orderItems: XmlCorrectionOrderItem[],
  used: Set<string>,
): XmlCorrectionOrderItem | undefined {
  const skuKey = String(xmlItem.sku ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^0+/, '');
  const descKey = normalizeItemName(xmlItem.description);
  return (
    (skuKey
      ? pickUnused(orderItems, used, (it) => {
          const sku = String(it.sku ?? '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .replace(/^0+/, '');
          return Boolean(sku) && sku === skuKey;
        })
      : undefined) ??
    pickUnused(
      orderItems,
      used,
      (it) =>
        normalizeItemName(it.description) === descKey &&
        it.quantity === xmlItem.quantity,
    ) ??
    pickUnused(
      orderItems,
      used,
      (it) =>
        it.lineNumber === xmlItem.nItem || it.lineNumber === xmlItem.nItem * 10,
    )
  );
}

/**
 * Detecta item do pedido preenchido com produto WEG cujo nome diverge do XML.
 * Ex.: "Copo Térmico Cuia" (catálogo) vs "Copo de Viagem" (NF-e).
 */
export function planWrongWegItemReplaces(input: {
  orderItems: XmlCorrectionOrderItem[];
  xmlItems: NfeXmlItem[];
  externalItems?: ExternalItemRef[];
}): ItemReplacePatch[] {
  const catalog = input.externalItems ?? [];
  const orderItems = [...input.orderItems].sort(
    (a, b) => a.lineNumber - b.lineNumber,
  );
  const used = new Set<string>();
  const replaces: ItemReplacePatch[] = [];

  const pairOneToOne =
    orderItems.length === input.xmlItems.length && orderItems.length === 1;

  for (const xmlItem of input.xmlItems) {
    const xmlName = xmlItem.description.trim();
    if (!xmlName) continue;
    let matched = matchXmlToOrderItem(xmlItem, orderItems, used);
    if (!matched && pairOneToOne) {
      matched = orderItems[0];
    }
    if (!matched) continue;
    used.add(matched.id);

    const xmlKey = normalizeItemName(xmlName);
    const orderKey = normalizeItemName(matched.description);
    if (xmlKey === orderKey) continue;
    if (!matched.productId) continue;
    const productKey = normalizeItemName(matched.productName);
    if (productKey && productKey === xmlKey) continue;

    const reuse = findSimilarExternalItem(xmlName, catalog);
    replaces.push({
      itemId: matched.id,
      lineNumber: matched.lineNumber,
      fromDescription: matched.description,
      toDescription: xmlName,
      fromSku: matched.sku,
      toSku: xmlItem.sku.trim() || matched.sku,
      productId: matched.productId,
      productName: matched.productName,
      unitPrice: xmlItem.unitPrice > 0 ? xmlItem.unitPrice : matched.unitPrice,
      ncm: xmlItem.ncm,
      unit: xmlItem.unit,
      externalItemName: xmlName,
      reuseExternalItemId: reuse?.id ?? null,
    });
  }

  return replaces;
}
