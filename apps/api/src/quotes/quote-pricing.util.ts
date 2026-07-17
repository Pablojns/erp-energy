import { Prisma } from '@erp/database';

/** Margem de venda padrão (faixa 1–99) — margem por dentro. */
export const DEFAULT_SALES_MARGIN_PERCENT = '40';

const D = Prisma.Decimal;

function asDecimal(
  value: Prisma.Decimal | number | string | null | undefined,
  fallback: Prisma.Decimal | number | string = 0,
): Prisma.Decimal {
  if (value === null || value === undefined) return new D(fallback);
  try {
    // Sempre via string para não perder casas (rateios mínimos de Difal etc.)
    if (typeof value === 'object') {
      const s = value.toString();
      const d = new D(s);
      return d.isFinite() ? d : new D(fallback);
    }
    const d = new D(value);
    return d.isFinite() ? d : new D(fallback);
  } catch {
    return new D(fallback);
  }
}

function nonNeg(d: Prisma.Decimal): Prisma.Decimal {
  return d.lessThan(0) ? new D(0) : d;
}

/** Arredonda apenas para exibição / total final (centavos). */
export function roundMoneyDecimal(
  value: Prisma.Decimal | number | string,
  decimals = 2,
): Prisma.Decimal {
  return asDecimal(value).toDecimalPlaces(decimals, D.ROUND_HALF_UP);
}

/**
 * Denominador da margem por dentro: 1 - (comissão + reserva + margemVenda) / 100.
 * Retorna null se totalPercent >= 100 (divisão inválida).
 */
export function quoteMarginDenominator(
  commissionPercent: Prisma.Decimal | number | string,
  marginReservePercent: Prisma.Decimal | number | string,
  salesMarginPercent: Prisma.Decimal | number | string,
): Prisma.Decimal | null {
  const commission = nonNeg(asDecimal(commissionPercent));
  const reserve = nonNeg(asDecimal(marginReservePercent));
  const sales = nonNeg(asDecimal(salesMarginPercent, DEFAULT_SALES_MARGIN_PERCENT));
  const totalPercent = commission.add(reserve).add(sales);
  const denom = new D(1).sub(totalPercent.div(100));
  if (denom.lessThanOrEqualTo(0)) return null;
  return denom;
}

/**
 * Preço unitário com precisão completa (sem arredondar intermediários):
 * custoBase = produto + gravação + (difal/qtd) + (outros/qtd)
 * totalPercent = comissão% + reserva% + margemVenda%
 * preçoFinal = custoBase / (1 - totalPercent/100)
 *
 * Equivalente estável (preserva rateios mínimos, ex. 10/10080):
 * (produto*qtd + grav*qtd + difal + outros) / (qtd * (1 - totalPercent/100))
 */
export function calcQuoteItemUnitPriceDecimal(input: {
  productPrice: Prisma.Decimal | number | string;
  engravingPrice?: Prisma.Decimal | number | string | null;
  commissionPercent: Prisma.Decimal | number | string;
  marginReservePercent: Prisma.Decimal | number | string;
  salesMarginPercent?: Prisma.Decimal | number | string | null;
  quantity: number;
  difalValue?: Prisma.Decimal | number | string | null;
  otherExtraCosts?: Prisma.Decimal | number | string | null;
}): Prisma.Decimal {
  const product = nonNeg(asDecimal(input.productPrice));
  const engraving = nonNeg(asDecimal(input.engravingPrice));
  const qty =
    Number.isFinite(input.quantity) && input.quantity > 0
      ? new D(String(Math.floor(input.quantity)))
      : new D(1);
  const difal = nonNeg(asDecimal(input.difalValue));
  const other = nonNeg(asDecimal(input.otherExtraCosts));

  const denom = quoteMarginDenominator(
    input.commissionPercent,
    input.marginReservePercent,
    input.salesMarginPercent ?? DEFAULT_SALES_MARGIN_PERCENT,
  );

  // Numerador em escala da quantidade — não arredonda difal/qtd antes.
  const numerator = product
    .mul(qty)
    .add(engraving.mul(qty))
    .add(difal)
    .add(other);

  if (!denom) {
    return numerator.div(qty);
  }
  return numerator.div(qty.mul(denom));
}

/**
 * Total da linha (padrão Brinde.me):
 * arredonda o unitário para 2 casas e só então multiplica pela quantidade.
 */
export function calcQuoteItemLineTotalDecimal(input: {
  productPrice: Prisma.Decimal | number | string;
  engravingPrice?: Prisma.Decimal | number | string | null;
  commissionPercent: Prisma.Decimal | number | string;
  marginReservePercent: Prisma.Decimal | number | string;
  salesMarginPercent?: Prisma.Decimal | number | string | null;
  quantity: number;
  difalValue?: Prisma.Decimal | number | string | null;
  otherExtraCosts?: Prisma.Decimal | number | string | null;
}): Prisma.Decimal {
  const unitRounded = roundMoneyDecimal(calcQuoteItemUnitPriceDecimal(input), 2);
  const qty = input.quantity > 0 ? new D(input.quantity) : new D(1);
  return unitRounded.mul(qty);
}

/** @deprecated Prefer calcQuoteItemUnitPriceDecimal — mantido para compat. */
export function calcQuoteItemUnitPrice(
  productPrice: number,
  engravingPrice: number,
  commissionPercent: number,
  marginReservePercent: number,
  salesMarginPercent: number | string = DEFAULT_SALES_MARGIN_PERCENT,
  quantity: number = 1,
  difalValue: number = 0,
  otherExtraCosts: number = 0,
): number {
  return Number(
    roundMoneyDecimal(
      calcQuoteItemUnitPriceDecimal({
        productPrice,
        engravingPrice,
        commissionPercent,
        marginReservePercent,
        salesMarginPercent,
        quantity,
        difalValue,
        otherExtraCosts,
      }),
    ).toString(),
  );
}

/**
 * Fator custoBase → preçoFinal (margem por dentro):
 * 1 / (1 - (comissão + reserva + margemVenda) / 100)
 */
export function quotePricingFactor(
  commissionPercent: number | string | Prisma.Decimal,
  marginReservePercent: number | string | Prisma.Decimal,
  salesMarginPercent: number | string | Prisma.Decimal,
): Prisma.Decimal {
  const denom = quoteMarginDenominator(
    commissionPercent,
    marginReservePercent,
    salesMarginPercent,
  );
  if (!denom) return new D(1);
  return new D(1).div(denom);
}

export function toNumDecimal(
  value: { toString(): string } | number | string | null | undefined,
  fallback: number | string = 0,
): number {
  if (value === null || value === undefined) return Number(fallback);
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number(fallback);
  }
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : Number(fallback);
}

export function toDecimal(
  value: { toString(): string } | number | string | null | undefined,
  fallback: number | string = 0,
): Prisma.Decimal {
  return asDecimal(
    value === null || value === undefined
      ? fallback
      : typeof value === 'number' || typeof value === 'string'
        ? value
        : value.toString(),
    fallback,
  );
}
