import { resolveOrderBuyerFields } from './order-buyer';

describe('resolveOrderBuyerFields', () => {
  it('usa o cadastro atual quando o pedido tem Customer vinculado', () => {
    expect(
      resolveOrderBuyerFields({
        customerName: 'Kaik Camargo Fontana Cáo / Kaik Camargo Fontana Cáo',
        customerDocument: '000',
        deliveryAddress: 'Rua antiga',
        customer: {
          name: 'Kaik Camargo Fontana Cáo',
          document: '12345678901',
          deliveryAddress: 'Rua nova, 10',
        },
      }),
    ).toEqual({
      customerName: 'Kaik Camargo Fontana Cáo',
      customerDocument: '12345678901',
      deliveryAddress: 'Rua antiga',
    });
  });

  it('cai no campo do pedido quando não há vínculo formal', () => {
    expect(
      resolveOrderBuyerFields({
        customerName: 'Avulso',
        customerDocument: '99',
        deliveryAddress: 'Rua X',
        customer: null,
      }),
    ).toEqual({
      customerName: 'Avulso',
      customerDocument: '99',
      deliveryAddress: 'Rua X',
    });
  });

  it('usa o endereço do cadastro só quando o pedido não tem endereço próprio', () => {
    expect(
      resolveOrderBuyerFields({
        customerName: 'Nome no pedido',
        customerDocument: '111',
        deliveryAddress: '',
        customer: {
          name: 'Nome oficial',
          document: null,
          deliveryAddress: 'Rua do cadastro',
        },
      }),
    ).toEqual({
      customerName: 'Nome oficial',
      customerDocument: '111',
      deliveryAddress: 'Rua do cadastro',
    });
  });

  it('mantém o fallback do pedido se o cadastro vier sem aquele dado', () => {
    expect(
      resolveOrderBuyerFields({
        customerName: 'Nome no pedido',
        customerDocument: '111',
        deliveryAddress: 'Endereço no pedido',
        customer: { name: 'Nome oficial', document: null, deliveryAddress: '' },
      }),
    ).toEqual({
      customerName: 'Nome oficial',
      customerDocument: '111',
      deliveryAddress: 'Endereço no pedido',
    });
  });
});
