import { mergeWegNotasAbertas } from './notas-abertas';
import type { WegOrderNfInput } from './notas-abertas';

function order(partial: Partial<WegOrderNfInput> & { id: string }): WegOrderNfInput {
  return {
    code: partial.code ?? 'PED-1',
    externalOrderNumber: partial.externalOrderNumber ?? '4518317833118',
    invoiceNumber: partial.invoiceNumber ?? null,
    notaRemessa: partial.notaRemessa ?? null,
    invoicedAt: partial.invoicedAt ?? null,
    createdAt: partial.createdAt ?? new Date('2026-09-02T12:00:00.000Z'),
    customerName: partial.customerName ?? 'WEG',
    invoiceHistory: partial.invoiceHistory ?? [],
    exits: partial.exits ?? [],
    id: partial.id,
  };
}

describe('mergeWegNotasAbertas', () => {
  const now = new Date('2026-09-18T15:00:00.000Z');

  it('une CA + histórico sem duplicar a mesma NF e ignora remessa', () => {
    const rows = mergeWegNotasAbertas({
      now,
      orders: [
        order({
          id: 'o1',
          invoiceNumber: '1 - 2140',
          notaRemessa: '870',
          invoiceHistory: [
            {
              invoiceNumber: '1 - 2140',
              invoiceValue: 100,
              createdAt: new Date('2026-09-02T12:00:00.000Z'),
            },
            {
              invoiceNumber: '870',
              invoiceValue: 0,
              createdAt: new Date('2026-09-01T12:00:00.000Z'),
            },
          ],
        }),
      ],
      titulos: [
        {
          id: 'ca-2140',
          numero: '2140',
          descricao: 'NF 2140',
          contraParte: 'WEG EQUIPAMENTOS',
          valor: 100,
          competencia: new Date('2026-09-02T12:00:00.000Z'),
          vencimento: new Date('2026-09-14T12:00:00.000Z'),
        },
        {
          id: 'ca-other',
          numero: '9999',
          descricao: 'Cliente avulso',
          contraParte: 'ACME LTDA',
          valor: 50,
          competencia: new Date('2026-09-02T12:00:00.000Z'),
          vencimento: new Date('2026-09-14T12:00:00.000Z'),
        },
      ],
      conciliacoes: [],
    });

    expect(rows.map((r) => r.invoiceDigits)).toEqual(['2140']);
    expect(rows[0].fonte).toBe('AMBOS');
    expect(rows[0].pedido).toBe('4518317833118');
    expect(rows[0].vencimento.slice(0, 10)).toBe('2026-09-14');
    expect(rows[0].diasEmAberto).toBe(16);
    expect(rows[0].status).toBe('VAZIO');
  });

  it('esconde 2025 da lista aberta e marca legado no histórico', () => {
    const orders = [
      order({
        id: 'o-old',
        externalOrderNumber: '4518000000',
        invoiceHistory: [
          {
            invoiceNumber: '981',
            invoiceValue: 10,
            createdAt: new Date('2025-12-15T12:00:00.000Z'),
          },
        ],
      }),
      order({
        id: 'o-new',
        invoiceHistory: [
          {
            invoiceNumber: '2140',
            invoiceValue: 20,
            createdAt: new Date('2026-09-02T12:00:00.000Z'),
          },
        ],
      }),
    ];

    const aberto = mergeWegNotasAbertas({
      now,
      orders,
      titulos: [],
      conciliacoes: [],
      includeLegado: false,
    });
    expect(aberto.map((r) => r.invoiceDigits)).toEqual(['2140']);

    const hist = mergeWegNotasAbertas({
      now,
      orders,
      titulos: [],
      conciliacoes: [],
      includeLegado: true,
    });
    const legado = hist.find((r) => r.invoiceDigits === '981');
    expect(legado?.status).toBe('LEGADO');
    expect(legado?.legado).toBe(true);
  });

  it('sobe de vazio → declarado → confirmado', () => {
    const orders = [
      order({
        id: 'o1',
        invoiceHistory: [
          {
            invoiceNumber: '2140',
            invoiceValue: 20,
            createdAt: new Date('2026-09-02T12:00:00.000Z'),
          },
        ],
      }),
    ];
    const declarado = mergeWegNotasAbertas({
      now,
      orders,
      titulos: [],
      conciliacoes: [
        {
          invoiceDigits: '2140',
          declaradoPagoEm: new Date('2026-09-08T12:00:00.000Z'),
          declaradoPagoValor: 20,
          confirmadoRecebidoEm: null,
          confirmadoRecebidoPorNome: null,
          confirmadoRecebidoOrigem: null,
          declaradoPagoDoc: null,
          alertaBancoData: null,
          alertaBancoValor: null,
          alertaBancoNome: null,
          alertaBancoHistorico: null,
          orderId: 'o1',
          contaAzulTituloId: null,
        },
      ],
    });
    expect(declarado[0].status).toBe('DECLARADO');

    const confirmado = mergeWegNotasAbertas({
      now,
      orders,
      titulos: [],
      conciliacoes: [
        {
          invoiceDigits: '2140',
          declaradoPagoEm: new Date('2026-09-08T12:00:00.000Z'),
          declaradoPagoValor: 20,
          confirmadoRecebidoEm: new Date('2026-09-18T12:00:00.000Z'),
          confirmadoRecebidoPorNome: 'Julia',
          confirmadoRecebidoOrigem: null,
          declaradoPagoDoc: null,
          alertaBancoData: null,
          alertaBancoValor: null,
          alertaBancoNome: null,
          alertaBancoHistorico: null,
          orderId: 'o1',
          contaAzulTituloId: null,
        },
      ],
    });
    expect(confirmado[0].status).toBe('CONFIRMADO');
    expect(confirmado[0].confirmadoRecebidoPor).toBe('Julia');
  });

  it('inclui NF só da Conta Azul quando o destinatário é WEG', () => {
    const rows = mergeWegNotasAbertas({
      now,
      orders: [],
      titulos: [
        {
          id: 'ca-1',
          numero: '2106',
          descricao: 'NF-e 2106',
          contraParte: 'WEG TURBINAS',
          valor: 1708.44,
          competencia: new Date('2026-08-27T12:00:00.000Z'),
          vencimento: new Date('2026-09-08T12:00:00.000Z'),
        },
      ],
      conciliacoes: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoiceDigits: '2106',
      fonte: 'CONTA_AZUL',
    });
  });

  it('não trata número de pedido WEG como NF e lê NF-e da descrição', () => {
    const rows = mergeWegNotasAbertas({
      now,
      orders: [],
      titulos: [
        {
          id: 'ca-bad',
          numero: '4518131180',
          descricao: 'Venda 4518131180',
          contraParte: 'WEG',
          valor: 10,
          competencia: new Date('2026-04-02T12:00:00.000Z'),
          vencimento: new Date('2026-04-14T12:00:00.000Z'),
        },
        {
          id: 'ca-desc',
          numero: '4518238754',
          descricao: 'Venda 4518238754 / NF-e:1056',
          contraParte: 'WEG',
          valor: 20,
          competencia: new Date('2026-01-22T12:00:00.000Z'),
          vencimento: new Date('2026-02-03T12:00:00.000Z'),
        },
      ],
      conciliacoes: [],
    });
    expect(rows.map((r) => r.invoiceDigits)).toEqual(['1056']);
    expect(rows[0].pedido).toBe('4518238754');
  });
});
