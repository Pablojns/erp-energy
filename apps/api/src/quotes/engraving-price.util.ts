import { Prisma } from '@erp/database';

export type EngravingTierLike = {
  qtyFrom: number;
  qtyTo: number;
  cost: Prisma.Decimal | number | string;
  costType: string;
  fixedFee?: Prisma.Decimal | number | string | null;
  applicationCost?: Prisma.Decimal | number | string | null;
};

function toNum(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Preço unitário da gravação para a quantidade informada (faixa correspondente). */
export function calcEngravingUnitPrice(
  tiers: EngravingTierLike[],
  quantity: number,
): number | null {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const tier = tiers.find((t) => qty >= t.qtyFrom && qty <= t.qtyTo);
  if (!tier) return null;

  const cost = toNum(tier.cost);
  const fixedFee = toNum(tier.fixedFee);
  const applicationCost = toNum(tier.applicationCost);
  const isInterval = /intervalo/i.test(tier.costType || '');

  const base = isInterval ? cost / qty : cost;
  return Math.max(0, base + applicationCost + fixedFee / qty);
}

export function roundMoney(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}
