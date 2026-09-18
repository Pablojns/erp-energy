import {
  isOrderLineReceived,
  isReceivedPlanilhaItemStatus,
  pickedQtyWhenReceived,
  shouldAutoFinalizeOrder,
} from './pedidos-import';

describe('pickedQtyWhenReceived', () => {
  it('reconhece Recebido e OK', () => {
    expect(isReceivedPlanilhaItemStatus('Recebido')).toBe(true);
    expect(isReceivedPlanilhaItemStatus('OK')).toBe(true);
    expect(isReceivedPlanilhaItemStatus('Em falta')).toBe(false);
    expect(isReceivedPlanilhaItemStatus('')).toBe(false);
  });

  it('preenche Qtd Separada e zera Falta ao marcar Recebido', () => {
    expect(pickedQtyWhenReceived('Recebido', 50, 0)).toEqual({
      pickedQty: 50,
      missingQty: 0,
    });
    expect(pickedQtyWhenReceived('OK', 100, 0)).toEqual({
      pickedQty: 100,
      missingQty: 0,
    });
  });

  it('não altera linha já 100% separada', () => {
    expect(pickedQtyWhenReceived('Recebido', 30, 30)).toBeNull();
  });
});

describe('shouldAutoFinalizeOrder', () => {
  it('fecha quando todas as linhas estão Recebido', () => {
    expect(
      shouldAutoFinalizeOrder('PARCIAL', [
        { mercadoEletronicoItemStatus: 'Recebido', quantity: 51, pickedQty: 51, missingQty: 0 },
        { mercadoEletronicoItemStatus: 'OK', quantity: 18, pickedQty: 18, missingQty: 0 },
      ]),
    ).toBe(true);
  });

  it('não fecha se ainda há linha PARCIAL', () => {
    expect(
      shouldAutoFinalizeOrder('PARCIAL', [
        { mercadoEletronicoItemStatus: 'Recebido', quantity: 51, pickedQty: 51, missingQty: 0 },
        { mercadoEletronicoItemStatus: 'Em falta', quantity: 14, pickedQty: 13, missingQty: 1 },
      ]),
    ).toBe(false);
  });

  it('não reabre FINALIZADO / CANCELADO', () => {
    const lines = [
      { mercadoEletronicoItemStatus: 'Recebido', quantity: 1, pickedQty: 1, missingQty: 0 },
    ];
    expect(shouldAutoFinalizeOrder('FINALIZADO', lines)).toBe(false);
    expect(shouldAutoFinalizeOrder('CANCELADO', lines)).toBe(false);
  });

  it('não fecha só pela quantidade — exige status Recebido/OK', () => {
    expect(
      isOrderLineReceived({
        mercadoEletronicoItemStatus: '',
        quantity: 10,
        pickedQty: 10,
        missingQty: 0,
      }),
    ).toBe(false);
    expect(
      shouldAutoFinalizeOrder('PARCIAL', [
        { mercadoEletronicoItemStatus: '', quantity: 10, pickedQty: 10, missingQty: 0 },
      ]),
    ).toBe(false);
  });
});
