import {
  isReceivedPlanilhaItemStatus,
  pickedQtyWhenReceived,
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
