import {
  applyExternalItemInbound,
  applyExternalItemOutbound,
} from './external-item-stock';

type ItemRow = { id: string; name: string; stockQty: number };

function fakeTx(item: ItemRow) {
  const movements: Array<{ movementType: string; quantity: number }> = [];
  return {
    movements,
    tx: {
      externalItem: {
        findUnique: async () => item,
        update: async ({ data }: { data: { stockQty: number } }) => {
          item.stockQty = data.stockQty;
          return item;
        },
      },
      externalItemStockMovement: {
        create: async ({ data }: { data: { movementType: string; quantity: number } }) => {
          movements.push({
            movementType: data.movementType,
            quantity: data.quantity,
          });
          return data;
        },
      },
    },
  };
}

describe('external-item-stock', () => {
  it('entrada soma o saldo e grava INBOUND', async () => {
    const item = { id: 'ext-1', name: 'Copo Viagem', stockQty: 2 };
    const { tx, movements } = fakeTx(item);
    const result = await applyExternalItemInbound(tx as never, {
      externalItemId: 'ext-1',
      quantity: 10,
    });
    expect(result.stockQty).toBe(12);
    expect(item.stockQty).toBe(12);
    expect(movements).toEqual([{ movementType: 'INBOUND', quantity: 10 }]);
  });

  it('saída com saldo desconta e não avisa', async () => {
    const item = { id: 'ext-1', name: 'Copo Viagem', stockQty: 10 };
    const { tx, movements } = fakeTx(item);
    const result = await applyExternalItemOutbound(tx as never, {
      externalItemId: 'ext-1',
      quantity: 3,
      reference: 'PED-1',
    });
    expect(result).toMatchObject({
      stockQty: 7,
      deducted: 3,
      insufficient: false,
      warning: null,
    });
    expect(movements).toEqual([{ movementType: 'OUTBOUND', quantity: 3 }]);
  });

  it('saída sem saldo suficiente avisa e não bloqueia (desconta o disponível)', async () => {
    const item = { id: 'ext-1', name: 'Copo Viagem', stockQty: 2 };
    const { tx, movements } = fakeTx(item);
    const result = await applyExternalItemOutbound(tx as never, {
      externalItemId: 'ext-1',
      quantity: 10,
    });
    expect(result.insufficient).toBe(true);
    expect(result.deducted).toBe(2);
    expect(result.stockQty).toBe(0);
    expect(result.warning).toContain('Saldo insuficiente');
    expect(movements).toEqual([{ movementType: 'OUTBOUND', quantity: 2 }]);
  });

  it('saída com estoque zero avisa e não cria movimento', async () => {
    const item = { id: 'ext-1', name: 'Copo Viagem', stockQty: 0 };
    const { tx, movements } = fakeTx(item);
    const result = await applyExternalItemOutbound(tx as never, {
      externalItemId: 'ext-1',
      quantity: 5,
    });
    expect(result.insufficient).toBe(true);
    expect(result.deducted).toBe(0);
    expect(movements).toEqual([]);
  });
});
