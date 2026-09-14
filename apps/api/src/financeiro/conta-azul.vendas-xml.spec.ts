import { mapContaAzulVenda } from './conta-azul.vendas';
import type { NfeXmlDados } from './conta-azul.nfe-xml';
import {
  classifyXmlVendas,
  isMissingMoney,
  planCaso1Completar,
  planCaso2Criar,
  reclassifyByInvoice,
  uniqueExternalOrderNumber,
  type ErpOrderForXml,
} from './conta-azul.vendas-xml';

function venda(partial: Record<string, unknown>) {
  return mapContaAzulVenda({
    id: 'vnd-1',
    numero: '7',
    total: 3734,
    cliente: { nome: 'PRATYC', documento: '29720805000191' },
    ...partial,
  })!;
}

function order(partial: Partial<ErpOrderForXml> = {}): ErpOrderForXml {
  return {
    id: 'o1',
    code: 'PED-000001',
    source: 'WEG_MERCADO_ELETRONICO',
    externalOrderNumber: '4517108980',
    customerName: 'WEG',
    customerDocument: '07175725001050',
    deliveryCnpj: '07175725001050',
    invoiceNumber: '1959',
    notaRemessa: null,
    status: 'FINALIZADO',
    total: 200,
    contaAzulVendaId: 'vnd-weg',
    items: [
      {
        id: 'i1',
        lineNumber: 10,
        sku: 'SKU-10',
        supplierMaterialCode: null,
        description: 'Modulo 550W',
        quantity: 2,
        unit: null,
        ncm: null,
        unitPrice: 0,
        totalPrice: 0,
        productId: 'p1',
      },
    ],
    ...partial,
  };
}

const xml: NfeXmlDados = {
  invoiceNumber: '1959',
  chave: null,
  emitidaEm: '2026-03-10T14:22:00-03:00',
  emitCnpj: '41356091000180',
  destDocumento: '29720805000191',
  destNome: 'PRATYC COMERCIO',
  destEnderecoJson: '{"v":1}',
  destCidade: 'Campinas',
  destUf: 'SP',
  total: 1700.5,
  items: [
    {
      nItem: 1,
      sku: 'SKU-10',
      description: 'Modulo 550W',
      ncm: '85414000',
      unit: 'UN',
      quantity: 2,
      unitPrice: 100,
      totalPrice: 200,
    },
    {
      nItem: 2,
      sku: 'SKU-20',
      description: 'Inversor 8kW',
      ncm: null,
      unit: 'UN',
      quantity: 1,
      unitPrice: 1500.5,
      totalPrice: 1500.5,
    },
  ],
};

describe('classifyXmlVendas', () => {
  it('Caso 1 quando contaAzulVendaId já está no pedido', () => {
    const rows = classifyXmlVendas({
      vendas: [venda({ id: 'vnd-weg', numero: '4517108980', total: 200 })],
      orders: [order()],
    });
    expect(rows[0]).toMatchObject({
      caso: 'caso1',
      via: 'contaAzulVendaId',
      order: expect.objectContaining({ id: 'o1' }),
    });
  });

  it('não cria Caso 2 se o P1 ainda teria match claro (evita duplicata WEG)', () => {
    const rows = classifyXmlVendas({
      vendas: [venda({ id: 'vnd-new', numero: '4517108980', total: 200 })],
      orders: [order({ contaAzulVendaId: null })],
    });
    expect(rows[0].caso).toBe('caso1');
    expect(rows[0].via).toBe('p1_claro');
  });

  it('Caso 2 para venda avulsa sem pedido (PRATYC)', () => {
    const rows = classifyXmlVendas({
      vendas: [venda({ id: 'vnd-pratyc' })],
      orders: [order({ contaAzulVendaId: 'other' })],
    });
    expect(rows[0]).toMatchObject({ caso: 'caso2', via: 'sem_pedido' });
  });

  it('marca ambíguo quando CNPJ+valor bate em vários pedidos', () => {
    const rows = classifyXmlVendas({
      vendas: [
        venda({
          id: 'vnd-x',
          numero: '999',
          total: 200,
          cliente: { documento: '07175725001050', nome: 'WEG' },
        }),
      ],
      orders: [
        order({ id: 'a', contaAzulVendaId: null, externalOrderNumber: 'A1' }),
        order({
          id: 'b',
          code: 'PED-2',
          contaAzulVendaId: null,
          externalOrderNumber: 'B1',
        }),
      ],
    });
    expect(rows[0].caso).toBe('ambiguo');
  });
});

describe('reclassifyByInvoice', () => {
  it('sobe para Caso 1 se a NF já existe no ERP', () => {
    const row = classifyXmlVendas({
      vendas: [venda({ id: 'vnd-pratyc' })],
      orders: [order({ contaAzulVendaId: 'other' })],
    })[0];
    const next = reclassifyByInvoice({
      row,
      invoiceNumber: '1959',
      orders: [order({ contaAzulVendaId: 'other' })],
    });
    expect(next.caso).toBe('caso1');
    expect(next.via).toBe('invoiceNumber');
  });
});

describe('planCaso1Completar', () => {
  it('preenche preço faltante e adiciona item que só existe no XML', () => {
    const plan = planCaso1Completar({
      venda: venda({ id: 'vnd-weg' }),
      order: order(),
      xml,
      via: 'contaAzulVendaId',
    });
    expect(plan.perfeito).toBe(false);
    expect(plan.fills).toEqual([
      expect.objectContaining({
        itemId: 'i1',
        unitPrice: 100,
        totalPrice: 200,
        unit: 'UN',
        ncm: '85414000',
      }),
    ]);
    expect(plan.adds).toEqual([
      expect.objectContaining({
        sku: 'SKU-20',
        lineNumber: 20,
        unitPrice: 1500.5,
      }),
    ]);
  });

  it('não faz nada quando os itens já batem', () => {
    const plan = planCaso1Completar({
      venda: venda({ id: 'vnd-weg' }),
      order: order({
        items: [
          {
            id: 'i1',
            lineNumber: 10,
            sku: 'SKU-10',
            supplierMaterialCode: null,
            description: 'Modulo 550W',
            quantity: 2,
            unit: 'UN',
            ncm: '85414000',
            unitPrice: 100,
            totalPrice: 200,
            productId: 'p1',
          },
          {
            id: 'i2',
            lineNumber: 20,
            sku: 'SKU-20',
            supplierMaterialCode: null,
            description: 'Inversor 8kW',
            quantity: 1,
            unit: 'UN',
            ncm: null,
            unitPrice: 1500.5,
            totalPrice: 1500.5,
            productId: null,
          },
        ],
      }),
      xml,
      via: 'contaAzulVendaId',
    });
    expect(plan.perfeito).toBe(true);
    expect(plan.fills).toHaveLength(0);
    expect(plan.adds).toHaveLength(0);
  });

  it('não sobrescreve preço já preenchido', () => {
    const plan = planCaso1Completar({
      venda: venda({ id: 'vnd-weg' }),
      order: order({
        items: [
          {
            id: 'i1',
            lineNumber: 10,
            sku: 'SKU-10',
            supplierMaterialCode: null,
            description: 'Modulo 550W',
            quantity: 2,
            unit: 'UN',
            ncm: '85414000',
            unitPrice: 99,
            totalPrice: 198,
            productId: 'p1',
          },
        ],
      }),
      xml,
      via: 'contaAzulVendaId',
    });
    expect(plan.fills).toHaveLength(0);
    expect(plan.adds).toHaveLength(1);
  });
});

describe('planCaso2Criar', () => {
  it('monta pedido VENDA_EXTERNA com NF e itens do XML', () => {
    const taken = new Set<string>();
    const plan = planCaso2Criar({
      venda: venda({ id: 'vnd-pratyc' }),
      xml,
      takenExternal: taken,
      customerId: 'cust-1',
      companyEntityId: 'ce-1',
    });
    expect(plan.invoiceNumber).toBe('1959');
    expect(plan.customerName).toBe('PRATYC COMERCIO');
    expect(plan.items).toHaveLength(2);
    expect(plan.externalOrderNumber).toBe('7');
  });

  it('escolhe número externo que ainda não existe', () => {
    expect(
      uniqueExternalOrderNumber({
        venda: venda({ numero: '7' }),
        invoiceNumber: '1959',
        taken: new Set(['7']),
      }),
    ).toBe('NF-1959');
  });
});

describe('isMissingMoney', () => {
  it('trata zero como dado faltante', () => {
    expect(isMissingMoney(0)).toBe(true);
    expect(isMissingMoney(10)).toBe(false);
  });
});
