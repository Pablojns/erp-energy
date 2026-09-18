import { BANK_CREDIT_SOURCE, type BankCredit } from './bank-credits';
import { reconcileBankCredits } from './bank-reconcile';

function credit(
  partial: Partial<BankCredit> & { amount: number; counterparty: string },
): BankCredit {
  return {
    date: partial.date ?? new Date('2026-08-31T12:00:00.000Z'),
    amount: partial.amount,
    counterparty: partial.counterparty,
    historico: partial.historico ?? 'Pix recebido',
    source: BANK_CREDIT_SOURCE.INTER_CSV,
    externalId: partial.externalId ?? `${partial.counterparty}-${partial.amount}`,
  };
}

describe('reconcileBankCredits', () => {
  it('Camada 1: agrupa por Doc.compensação, tolera ±2 dias e confirma valor exato', () => {
    const result = reconcileBankCredits(
      [
        credit({
          amount: 3878.04,
          counterparty: 'Weg Equipamentos Eletricos S/a',
          date: new Date('2026-08-31T12:00:00.000Z'),
        }),
      ],
      [
        {
          invoiceDigits: '2106',
          pedido: '4518',
          valor: 1708.44,
          pagoEm: new Date('2026-08-29T12:00:00.000Z'),
          docCompensacao: '2001008405',
        },
        {
          invoiceDigits: '2107',
          pedido: '4519',
          valor: 2169.6,
          pagoEm: new Date('2026-08-29T12:00:00.000Z'),
          docCompensacao: '2001008405',
        },
      ],
    );
    expect(result.wegIdentificados).toBe(1);
    expect(result.autoMatches).toHaveLength(1);
    expect(result.autoMatches[0].notes.map((n) => n.invoiceDigits).sort()).toEqual([
      '2106',
      '2107',
    ]);
    expect(result.wegSemNota).toHaveLength(0);
  });

  it('Camada 1: crédito WEG sem nota correspondente permanece declarado', () => {
    const result = reconcileBankCredits(
      [credit({ amount: 99.9, counterparty: 'Weg Turbinas Ltda' })],
      [
        {
          invoiceDigits: '1',
          pedido: 'p',
          valor: 10,
          pagoEm: new Date('2026-08-31T12:00:00.000Z'),
          docCompensacao: null,
        },
      ],
    );
    expect(result.autoMatches).toHaveLength(0);
    expect(result.wegSemNota).toHaveLength(1);
  });

  it('Camada 2: valor bate mas nome desconhecido gera alerta, não confirma', () => {
    const result = reconcileBankCredits(
      [
        credit({
          amount: 333.34,
          counterparty: 'Bytedance Brasil Tecnologia Ltda.',
          date: new Date('2026-08-31T12:00:00.000Z'),
        }),
      ],
      [
        {
          invoiceDigits: '1888',
          pedido: '4518',
          valor: 333.34,
          pagoEm: new Date('2026-08-31T12:00:00.000Z'),
          docCompensacao: null,
        },
      ],
    );
    expect(result.autoMatches).toHaveLength(0);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].notes[0].invoiceDigits).toBe('1888');
    expect(result.alerts[0].credit.counterparty).toMatch(/Bytedance/i);
  });

  it('não usa o mesmo grupo duas vezes', () => {
    const notes = [
      {
        invoiceDigits: '1',
        pedido: 'p',
        valor: 100,
        pagoEm: new Date('2026-08-31T12:00:00.000Z'),
        docCompensacao: null,
      },
    ];
    const result = reconcileBankCredits(
      [
        credit({ amount: 100, counterparty: 'Weg Turbinas Ltda' }),
        credit({
          amount: 100,
          counterparty: 'Appmax',
          externalId: 'other',
        }),
      ],
      notes,
    );
    expect(result.autoMatches).toHaveLength(1);
    expect(result.alerts).toHaveLength(0);
  });
});
