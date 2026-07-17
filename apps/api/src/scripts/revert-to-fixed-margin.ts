/**
 * Reverte para margem de venda fixa (40%) em todos os orçamentos e
 * recalcula os preços dos itens com a fórmula de margem por dentro:
 *   preçoFinal = custoBase / (1 - (comissão% + reserva% + margemVenda%)/100)
 *
 * Uso (em apps/api):
 *   npx ts-node -r tsconfig-paths/register src/scripts/revert-to-fixed-margin.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Prisma, prisma } from '@erp/database';
import {
  calcQuoteItemLineTotalDecimal,
  calcQuoteItemUnitPriceDecimal,
  DEFAULT_SALES_MARGIN_PERCENT,
  roundMoneyDecimal,
  toDecimal,
} from '../quotes/quote-pricing.util';

const FIXED_MARGIN = '40';

function loadEnvFile(): void {
  const candidates = [
    resolve(__dirname, '../../.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const envPath of candidates) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) {
          process.env[key] = value;
        }
      }
      return;
    } catch {
      /* tenta próximo caminho */
    }
  }
}

async function main() {
  loadEnvFile();

  const margin = new Prisma.Decimal(FIXED_MARGIN);

  const quotesUpdated = await prisma.quote.updateMany({
    data: { salesMarginPercent: margin },
  });
  console.log(
    `[revert-to-fixed-margin] orçamentos com salesMarginPercent=${FIXED_MARGIN}: ${quotesUpdated.count}`,
  );

  const quotes = await prisma.quote.findMany({
    include: { items: true },
  });

  let itemsUpdated = 0;
  let quotesRecalculated = 0;

  for (const quote of quotes) {
    if (quote.items.length === 0) continue;

    const commission = toDecimal(quote.commissionPercent, 2);
    const reserve = toDecimal(quote.marginReservePercent, 6);
    const sales = toDecimal(FIXED_MARGIN, DEFAULT_SALES_MARGIN_PERCENT);
    const difal = toDecimal(quote.difalValue);
    const otherExtras = toDecimal(quote.otherExtraCosts);

    let subtotalPrecise = new Prisma.Decimal(0);

    for (const item of quote.items) {
      const qty = item.quantity > 0 ? item.quantity : 1;
      const productPrice =
        item.productPrice != null
          ? item.productPrice
          : toDecimal(item.unitPrice);

      const unitPrice = calcQuoteItemUnitPriceDecimal({
        productPrice,
        engravingPrice: item.engravingPrice,
        commissionPercent: commission,
        marginReservePercent: reserve,
        salesMarginPercent: sales,
        quantity: qty,
        difalValue: difal,
        otherExtraCosts: otherExtras,
      });
      const lineTotal = calcQuoteItemLineTotalDecimal({
        productPrice,
        engravingPrice: item.engravingPrice,
        commissionPercent: commission,
        marginReservePercent: reserve,
        salesMarginPercent: sales,
        quantity: qty,
        difalValue: difal,
        otherExtraCosts: otherExtras,
      });

      await prisma.quoteItem.update({
        where: { id: item.id },
        data: {
          ...(item.productPrice == null ? { productPrice } : {}),
          unitPrice,
          total: lineTotal,
        },
      });
      subtotalPrecise = subtotalPrecise.add(lineTotal);
      itemsUpdated += 1;
    }

    const freight =
      quote.freightToConsult || !quote.freightValue
        ? new Prisma.Decimal(0)
        : toDecimal(quote.freightValue);
    const totalPrecise = subtotalPrecise.add(freight);

    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        subtotal: roundMoneyDecimal(subtotalPrecise, 2),
        total: roundMoneyDecimal(totalPrecise, 2),
      },
    });
    quotesRecalculated += 1;
  }

  console.log(
    `[revert-to-fixed-margin] orçamentos recalculados: ${quotesRecalculated}`,
  );
  console.log(`[revert-to-fixed-margin] itens atualizados: ${itemsUpdated}`);
}

main()
  .catch((err) => {
    console.error('[revert-to-fixed-margin] falha:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
