import {
  cycleExitQtyFromItems,
  cycleQtysFromInvoiceHistory,
  resolveExitPendingQuantity,
  shippedQtyFromInvoiceHistory,
} from './exit-quantity';

describe('resolveExitPendingQuantity — pedido parcial 100 / 60 / 40', () => {
  const ordered = 100;

  it('1º ciclo: 60 separados, nada faturado → sai 60', () => {
    expect(
      resolveExitPendingQuantity({
        quantity: ordered,
        pickedQty: 60,
        invoicedQty: 0,
      }),
    ).toBe(60);
  });

  it('2º ciclo: pickedQty acumulado 100, já saíram 60 → sai 40 (não 100)', () => {
    expect(
      resolveExitPendingQuantity({
        quantity: ordered,
        pickedQty: 100,
        invoicedQty: 60,
      }),
    ).toBe(40);
  });

  it('não usa o total do pedido quando invoicedQty está zerado à toa', () => {
    expect(
      resolveExitPendingQuantity({
        quantity: ordered,
        pickedQty: 100,
        invoicedQty: 0,
      }),
    ).toBe(100);
  });

  it('soma o delta de várias linhas no ciclo', () => {
    expect(
      cycleExitQtyFromItems([
        { quantity: 100, pickedQty: 100, invoicedQty: 60 },
        { quantity: 10, pickedQty: 10, invoicedQty: 10 },
      ]),
    ).toBe(40);
  });
});

describe('shippedQtyFromInvoiceHistory', () => {
  it('snapshot cumulativo legado 60 + 100 → 100', () => {
    expect(
      shippedQtyFromInvoiceHistory([
        { pickedQtyAtTime: 60 },
        { pickedQtyAtTime: 100 },
      ]),
    ).toBe(100);
  });

  it('deltas 60 + 40 → 100', () => {
    expect(
      shippedQtyFromInvoiceHistory([
        { pickedQtyAtTime: 60 },
        { pickedQtyAtTime: 40 },
      ]),
    ).toBe(100);
  });
});

describe('cycleQtysFromInvoiceHistory', () => {
  it('converte snapshot cumulativo 60 / 100 em deltas 60 / 40', () => {
    expect(
      cycleQtysFromInvoiceHistory([
        { pickedQtyAtTime: 60 },
        { pickedQtyAtTime: 100 },
      ]),
    ).toEqual([60, 40]);
  });
});
