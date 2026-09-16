import { mapContaAzulVenda } from './conta-azul.vendas';
import { planXmlPedidoVinculos, type XmlPedidoOrder } from './conta-azul.xml-pedido-vinculo';
import type { NfeXmlDados } from './conta-azul.nfe-xml';

function venda(partial: Record<string, unknown>) {
  return mapContaAzulVenda({
    id: 'vnd-1',
    numero: '451846455715',
    total: 3734,
    cliente: { nome: 'WEG', documento: '07175725001050' },
    ...partial,
  })!;
}

function order(partial: Partial<XmlPedidoOrder> = {}): XmlPedidoOrder {
  return {
    id: 'o1',
    code: 'PED-000001',
    externalOrderNumber: '4518757385',
    invoiceNumber: null,
    customerName: 'WEG',
    customerDocument: '07175725001050',
    deliveryCnpj: '07175725001050',
    deliveryAddress: null,
    deliveryCity: null,
    deliveryState: null,
    receiverName: null,
    unloadingPoint: null,
    contaAzulVendaId: null,
    status: 'NOVO',
    ...partial,
  };
}

function xml(partial: Partial<NfeXmlDados> = {}): NfeXmlDados {
  return {
    invoiceNumber: '1889',
    chave: null,
    emitidaEm: '2026-03-10T14:22:00-03:00',
    saiuEm: null,
    volumes: 1,
    emitCnpj: '41356091000180',
    destDocumento: '07175725001050',
    destNome: 'WEG EQUIPAMENTOS ELETRICOS S.A.',
    destEnderecoJson: null,
    destCidade: 'Jaragua do Sul',
    destUf: 'SC',
    total: 3734,
    items: [
      {
        nItem: 1,
        sku: 'SKU-1',
        description: 'Item',
        ncm: null,
        unit: 'UN',
        quantity: 1,
        unitPrice: 10,
        totalPrice: 10,
      },
    ],
    compraXPed: '4518757385',
    infCpl: 'REQUISICAO DE COMPRA PEDIDO:4518757385#PONTO DE DESCARGA:X',
    ...partial,
  };
}

describe('planXmlPedidoVinculos', () => {
  it('vincula venda 451846455715 ao pedido 4518757385 via xPed da NF 1889', () => {
    const plan = planXmlPedidoVinculos({
      rows: [{ venda: venda({ id: 'vnd-ca' }), xml: xml(), xmlError: null }],
      orders: [order()],
    });
    expect(plan.vinculados).toHaveLength(1);
    expect(plan.vinculados[0]).toMatchObject({
      vendaId: 'vnd-ca',
      orderId: 'o1',
      xmlPedido: '4518757385',
      invoiceNumber: '1889',
      via: 'compra_xPed',
      reatribuir: false,
      fromOrderId: null,
    });
    expect(plan.parcelasFaltantes).toHaveLength(0);
    expect(plan.ambiguos).toHaveLength(0);
  });

  it('não usa família de 10 dígitos quando o xPed é outro número', () => {
    const plan = planXmlPedidoVinculos({
      rows: [
        {
          venda: venda({ id: 'vnd-parcela', numero: '45178185981' }),
          xml: xml({ compraXPed: '45178185981', infCpl: null }),
          xmlError: null,
        },
      ],
      orders: [
        order({ id: 'base', externalOrderNumber: '4517818598' }),
        order({ id: 'outro', externalOrderNumber: '4519085342' }),
      ],
    });
    expect(plan.vinculados).toHaveLength(0);
    expect(plan.parcelasFaltantes).toHaveLength(1);
    expect(plan.parcelasFaltantes[0]?.xmlPedido).toBe('45178185981');
    expect(plan.parcelasFaltantes[0]?.familyBaseOrderId).toBe('base');
  });

  it('identifica parcela WEG faltante e ignora Energy Brands', () => {
    const weg = planXmlPedidoVinculos({
      rows: [
        {
          venda: venda({ id: 'vnd-new', numero: '99' }),
          xml: xml({ compraXPed: '4518999999' }),
          xmlError: null,
        },
      ],
      orders: [order()],
    });
    expect(weg.parcelasFaltantes).toHaveLength(1);

    const energy = planXmlPedidoVinculos({
      rows: [
        {
          venda: venda({
            id: 'vnd-eb',
            cliente: { nome: 'Energy Brands', documento: '00' },
          }),
          xml: xml({ destNome: 'Energy Brands', compraXPed: '4518999999' }),
          xmlError: null,
        },
      ],
      orders: [order()],
    });
    expect(energy.parcelasFaltantes).toHaveLength(0);
    expect(energy.semPedidoXml[0]?.motivo).toMatch(/Energy Brands/i);
  });

  it('não cria parcela se xPed não parece número WEG (451…)', () => {
    const plan = planXmlPedidoVinculos({
      rows: [
        {
          venda: venda({ id: 'vnd-cnpj' }),
          xml: xml({ compraXPed: '071757250014' }),
          xmlError: null,
        },
      ],
      orders: [order()],
    });
    expect(plan.parcelasFaltantes).toHaveLength(0);
    expect(plan.pedidoXmlSemErp).toHaveLength(1);
  });

  it('reporta XML sem xPed/observação em vez de adivinhar', () => {
    const plan = planXmlPedidoVinculos({
      rows: [
        {
          venda: venda({ id: 'vnd-sem' }),
          xml: xml({ compraXPed: null, infCpl: 'SEM PEDIDO AQUI', items: [] }),
          xmlError: null,
        },
      ],
      orders: [order()],
    });
    expect(plan.vinculados).toHaveLength(0);
    expect(plan.parcelasFaltantes).toHaveLength(0);
    expect(plan.semPedidoXml).toHaveLength(1);
  });

  it('reatribui venda ligada na família errada (4518464557) para o xPed 4518757385', () => {
    const plan = planXmlPedidoVinculos({
      rows: [{ venda: venda({ id: 'vnd-ca' }), xml: xml(), xmlError: null }],
      orders: [
        order({
          id: 'wrong',
          code: 'PED-000453',
          externalOrderNumber: '4518464557',
          invoiceNumber: '1889',
          contaAzulVendaId: 'vnd-ca',
          status: 'FINALIZADO',
        }),
        order({
          id: 'o1',
          code: 'PED-000183',
          externalOrderNumber: '4518757385',
          invoiceNumber: null,
          contaAzulVendaId: null,
        }),
      ],
    });
    expect(plan.vinculados).toHaveLength(1);
    expect(plan.vinculados[0]).toMatchObject({
      orderId: 'o1',
      orderCode: 'PED-000183',
      xmlPedido: '4518757385',
      invoiceNumber: '1889',
      reatribuir: true,
      fromOrderId: 'wrong',
      fromOrderCode: 'PED-000453',
    });
    expect(plan.ambiguos).toHaveLength(0);
    expect(plan.parcelasFaltantes).toHaveLength(0);
  });

  it('não reaplica vínculo já correto no mesmo xPed', () => {
    const plan = planXmlPedidoVinculos({
      rows: [{ venda: venda({ id: 'vnd-ca' }), xml: xml(), xmlError: null }],
      orders: [
        order({
          id: 'o1',
          contaAzulVendaId: 'vnd-ca',
          invoiceNumber: '1889',
        }),
      ],
    });
    expect(plan.vinculados).toHaveLength(0);
    expect(plan.jaVinculados).toBe(1);
  });
});
