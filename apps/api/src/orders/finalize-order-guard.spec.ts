import { BadRequestException } from '@nestjs/common';
import {
  FINALIZE_NF_MISSING,
  assertCanFinalizeOrder,
  invoicedQtyMismatchMessage,
  stockQtyMismatchMessage,
  validateFinalizeOrder,
} from './finalize-order-guard';

describe('validateFinalizeOrder — trava de FINALIZADO', () => {
  const completeItem = {
    sku: 'SKU-A',
    quantity: 50,
    invoicedQty: 50,
    productId: 'prod-a',
  };

  it('1) bloqueia pedido sem NF vinculada', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: '   ',
      items: [completeItem],
      movements: [{ productId: 'prod-a', quantity: 50 }],
    });
    expect(result).toEqual({
      ok: false,
      message: FINALIZE_NF_MISSING,
      critical: false,
    });
  });

  it('1b) bloqueia invoiceNumber nulo', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: null,
      items: [completeItem],
      movements: [{ productId: 'prod-a', quantity: 50 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe(FINALIZE_NF_MISSING);
  });

  it('2) bloqueia quando invoicedQty não bate com a quantidade pedida', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: '2040',
      items: [
        { sku: 'SKU-X', quantity: 50, invoicedQty: 30, productId: 'prod-x' },
      ],
      movements: [{ productId: 'prod-x', quantity: 30 }],
    });
    expect(result).toEqual({
      ok: false,
      message: invoicedQtyMismatchMessage('SKU-X', 50, 30),
      critical: false,
    });
  });

  it('2b) bloqueia quando não há SAIDA_EXPEDICAO correspondente', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: '2040',
      items: [
        { sku: 'SKU-X', quantity: 50, invoicedQty: 50, productId: 'prod-x' },
      ],
      movements: [],
    });
    expect(result).toEqual({
      ok: false,
      message: stockQtyMismatchMessage('SKU-X', 50, 0),
      critical: true,
    });
  });

  it('2c) bloqueia quando a baixa de estoque é menor que o pedido', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: '2040',
      items: [
        { sku: 'SKU-X', quantity: 50, invoicedQty: 50, productId: 'prod-x' },
      ],
      movements: [{ productId: 'prod-x', quantity: 30 }],
    });
    expect(result).toEqual({
      ok: false,
      message: stockQtyMismatchMessage('SKU-X', 50, 30),
      critical: true,
    });
  });

  it('3) permite finalizar pedido com NF, invoicedQty e baixa de estoque corretos', () => {
    const result = validateFinalizeOrder({
      invoiceNumber: '13609288',
      items: [
        { sku: 'MOD-10', quantity: 1, invoicedQty: 1, productId: 'p1' },
        { sku: 'MOD-20', quantity: 1, invoicedQty: 1, productId: 'p2' },
      ],
      movements: [
        { productId: 'p1', quantity: 1 },
        { productId: 'p2', quantity: 1 },
      ],
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('assertCanFinalizeOrder', () => {
  function mockTx(opts: {
    items: Array<{
      sku: string;
      mercadoEletronicoItemStatus: string | null;
    }>;
  }) {
    return {
      orderItem: {
        findMany: jest.fn().mockResolvedValue(opts.items),
      },
    };
  }

  const order = {
    id: 'ord-1',
    code: 'PED-001',
    externalOrderNumber: '13609288',
    invoiceNumber: 'NF-1',
  };

  it('bloqueia quando alguma linha não está Recebido/OK', async () => {
    const tx = mockTx({
      items: [
        { sku: 'SKU-A', mercadoEletronicoItemStatus: 'Recebido' },
        { sku: 'SKU-X', mercadoEletronicoItemStatus: 'Em falta' },
      ],
    });
    await expect(assertCanFinalizeOrder(tx, order)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(assertCanFinalizeOrder(tx, order)).rejects.toThrow(
      'item SKU SKU-X não está Recebido/OK',
    );
  });

  it('não exige NF, invoicedQty nem SAIDA_EXPEDICAO', async () => {
    const tx = mockTx({
      items: [
        { sku: 'MOD-10', mercadoEletronicoItemStatus: 'Recebido' },
        { sku: 'MOD-20', mercadoEletronicoItemStatus: 'OK' },
      ],
    });
    await expect(
      assertCanFinalizeOrder(tx, { ...order, invoiceNumber: '' }),
    ).resolves.toBeUndefined();
  });

  it('passa quando todas as linhas estão Recebido/OK', async () => {
    const tx = mockTx({
      items: [
        { sku: 'MOD-10', mercadoEletronicoItemStatus: 'Recebido' },
        { sku: 'MOD-20', mercadoEletronicoItemStatus: 'OK' },
      ],
    });
    await expect(assertCanFinalizeOrder(tx, order)).resolves.toBeUndefined();
  });
});
