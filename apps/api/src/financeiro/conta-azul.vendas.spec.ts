import {
  mapContaAzulVenda,
  orderNumberVariants,
  planInvoiceFromLinkedVendas,
  planVendaVinculos,
  valuesClose,
} from './conta-azul.vendas';

describe('conta-azul.vendas', () => {
  it('mapeia venda da busca com cliente aninhado', () => {
    const v = mapContaAzulVenda({
      id: 'vnd-1',
      numero: 4519145810,
      total: 753.9,
      data: '2026-09-01',
      situacao: { nome: 'Aprovado' },
      cliente: { id: 'cli-1', nome: 'WEG', documento: '84.429.695/0001-11' },
    });
    expect(v).toMatchObject({
      contaAzulId: 'vnd-1',
      numero: '4519145810',
      total: 753.9,
      clienteNome: 'WEG',
      clienteDocumento: '84.429.695/0001-11',
    });
  });

  it('gera variantes do número WEG iguais às da reconciliação', () => {
    const set = new Set(orderNumberVariants('4519145810'));
    expect(set.has('4519145810')).toBe(true);
    expect(set.has('#4519145810')).toBe(true);
  });

  it('vincula com clareza quando o número externo é único', () => {
    const plan = planVendaVinculos({
      vendas: [
        mapContaAzulVenda({
          id: 'vnd-1',
          numero: '4519145810',
          total: 753.9,
          cliente: { documento: '84429695000111' },
        })!,
      ],
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '4519145810',
          customerDocument: '84429695000111',
          deliveryCnpj: null,
          total: 753.9,
          status: 'NOVO',
          contaAzulVendaId: null,
        },
      ],
    });
    expect(plan.claros).toHaveLength(1);
    expect(plan.claros[0].reason).toBe('numero_cnpj');
    expect(plan.semCorrespondencia).toHaveLength(0);
  });

  it('não vincula quando dois pedidos compartilham o número e o valor', () => {
    const plan = planVendaVinculos({
      vendas: [
        mapContaAzulVenda({
          id: 'vnd-2',
          numero: '10',
          total: 100,
        })!,
      ],
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '10',
          customerDocument: null,
          deliveryCnpj: null,
          total: 100,
          status: 'NOVO',
          contaAzulVendaId: null,
        },
        {
          id: 'o2',
          code: 'PED-2',
          externalOrderNumber: '0000000010',
          customerDocument: null,
          deliveryCnpj: null,
          total: 100,
          status: 'NOVO',
          contaAzulVendaId: null,
        },
      ],
    });
    expect(plan.claros).toHaveLength(0);
    expect(plan.semCorrespondencia[0].motivo).toMatch(/não desambiguaram/i);
  });

  it('não trata PED-000007 como venda número 7', () => {
    const plan = planVendaVinculos({
      vendas: [
        mapContaAzulVenda({
          id: 'vnd-7',
          numero: 7,
          total: 3734,
          cliente: { documento: '29720805000191' },
        })!,
      ],
      orders: [
        {
          id: 'o1',
          code: 'PED-000007',
          externalOrderNumber: '4518769084',
          customerDocument: '29720805000191',
          deliveryCnpj: null,
          total: 3734,
          status: 'NOVO',
          contaAzulVendaId: null,
        },
      ],
    });
    expect(plan.claros[0]?.reason).toBe('cnpj_valor');
    expect(plan.claros[0]?.orderId).toBe('o1');
  });

  it('aceita diferença de valor em centavos', () => {
    expect(valuesClose(100, 100.04)).toBe(true);
    expect(valuesClose(100, 102)).toBe(false);
  });

  it('preenche invoiceNumber vazio com a NF da venda vinculada', () => {
    const plan = planInvoiceFromLinkedVendas({
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '4518614536',
          invoiceNumber: null,
          notaRemessa: null,
          contaAzulVendaId: 'vnd-1',
        },
      ],
      notas: [{ idVenda: 'vnd-1', numero: '1959', numeroDigits: '1959' }],
    });
    expect(plan.preencher).toEqual([
      expect.objectContaining({
        orderId: 'o1',
        invoiceNumber: '1959',
        vendaId: 'vnd-1',
      }),
    ]);
    expect(plan.divergencias).toHaveLength(0);
  });

  it('trata remessa copiada em invoiceNumber como campo vazio', () => {
    const plan = planInvoiceFromLinkedVendas({
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '4518614536',
          invoiceNumber: '870',
          notaRemessa: '870',
          contaAzulVendaId: 'vnd-1',
        },
      ],
      notas: [{ idVenda: 'vnd-1', numero: '1959', numeroDigits: '1959' }],
    });
    expect(plan.preencher[0]?.invoiceNumber).toBe('1959');
  });

  it('não sobrescreve invoiceNumber diferente — só reporta divergência', () => {
    const plan = planInvoiceFromLinkedVendas({
      orders: [
        {
          id: 'o1',
          code: 'PED-1',
          externalOrderNumber: '4518614536',
          invoiceNumber: '2001',
          notaRemessa: null,
          contaAzulVendaId: 'vnd-1',
        },
      ],
      notas: [{ idVenda: 'vnd-1', numero: '1959', numeroDigits: '1959' }],
    });
    expect(plan.preencher).toHaveLength(0);
    expect(plan.divergencias[0]).toMatchObject({
      invoiceNumberErp: '2001',
      invoiceNumberCa: '1959',
    });
  });
});
