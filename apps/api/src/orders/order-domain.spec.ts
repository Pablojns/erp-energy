import { ORDER_SOURCE, orderStockReference } from './order-domain';

describe('orderStockReference', () => {
  it('usa o número WEG quando existe', () => {
    expect(
      orderStockReference({
        code: 'PED-000086',
        externalOrderNumber: '4518727765',
        customerName: 'WEG TINTAS LTDA',
        source: ORDER_SOURCE.WEG_MERCADO_ELETRONICO,
      }),
    ).toBe('4518727765');
  });

  it('na Venda Externa avulsa usa o nome do cliente', () => {
    expect(
      orderStockReference({
        code: 'PED-001722',
        externalOrderNumber: '4518317833117',
        customerName: 'GRUPO VISLUMBRA',
        source: ORDER_SOURCE.VENDA_EXTERNA,
      }),
    ).toBe('GRUPO VISLUMBRA');
  });

  it('cai no código interno só se não houver número nem cliente', () => {
    expect(
      orderStockReference({
        code: 'PED-000001',
        externalOrderNumber: null,
        customerName: '',
        source: ORDER_SOURCE.WEG_MERCADO_ELETRONICO,
      }),
    ).toBe('PED-000001');
  });
});
