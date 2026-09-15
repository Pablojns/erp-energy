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

const NAME_STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'com',
  'para',
  'em',
  'p',
  'pt',
  'un',
  'und',
]);

export function normalizeItemName(raw: string | null | undefined): string {
  return stripAccents(String(raw ?? '').trim().toLowerCase()).replace(/\s+/g, ' ');
}

/** Reduz plural/gênero (plastica/plastico → plastic) sem misturar produtos distintos. */
export function stemPtToken(token: string): string {
  const w = token.trim().toLowerCase();
  if (w.length <= 3) return w;
  const rules = [
    /icas$/,
    /icos$/,
    /ica$/,
    /ico$/,
    /osas$/,
    /osos$/,
    /osa$/,
    /oso$/,
    /adas$/,
    /ados$/,
    /ada$/,
    /ado$/,
    /as$/,
    /os$/,
    /es$/,
    /a$/,
    /o$/,
  ];
  for (const re of rules) {
    if (re.test(w)) {
      const stemmed = w.replace(re, '');
      if (stemmed.length >= 4) return stemmed;
    }
  }
  return w;
}

function significantTokens(raw: string | null | undefined): string[] {
  return normalizeItemName(raw)
    .split(' ')
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 0)
    .filter((w) => w.length > 2 || !NAME_STOPWORDS.has(w))
    .filter((w) => !NAME_STOPWORDS.has(w))
    .map(stemPtToken)
    .filter((w) => w.length > 1);
}

/**
 * Mesmo produto com variação mínima de escrita:
 * "CANETA PLASTICA" ≈ "CANETA PLASTICO";
 * "CANETA ESFERO PONTA TOUCH METAL PT" ≈ "... METAL".
 */
export function namesAreEquivalentProduct(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const w of sa) {
    if (sb.has(w)) inter += 1;
  }
  const union = sa.size + sb.size - inter;
  if (union > 0 && inter / union >= 0.85) return true;
  const extra = Math.abs(sa.size - sb.size);
  const smaller = sa.size <= sb.size ? sa : sb;
  const larger = sa.size <= sb.size ? sb : sa;
  if (smaller.size >= 3 && extra <= 1) {
    for (const w of smaller) {
      if (!larger.has(w)) return false;
    }
    return true;
  }
  return false;
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

function matchByNItemPed(
  xmlItem: NfeXmlItem,
  orderItems: XmlCorrectionOrderItem[],
  used: Set<string>,
): XmlCorrectionOrderItem | undefined {
  const n = xmlItem.nItemPed;
  if (n == null || n <= 0) return undefined;
  return (
    pickUnused(orderItems, used, (it) => it.lineNumber === n) ??
    pickUnused(orderItems, used, (it) => it.lineNumber === n * 10)
  );
}

function matchXmlToOrderItem(
  xmlItem: NfeXmlItem,
  orderItems: XmlCorrectionOrderItem[],
  used: Set<string>,
): XmlCorrectionOrderItem | undefined {
  if (xmlItem.nItemPed != null && xmlItem.nItemPed > 0) {
    return matchByNItemPed(xmlItem, orderItems, used);
  }
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
    if (
      !matched &&
      pairOneToOne &&
      !(xmlItem.nItemPed != null && xmlItem.nItemPed > 0)
    ) {
      matched = orderItems[0];
    }
    if (!matched) continue;
    used.add(matched.id);

    if (namesAreEquivalentProduct(xmlName, matched.description)) continue;
    if (namesAreEquivalentProduct(xmlName, matched.productName)) continue;
    if (!matched.productId) continue;

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
