import {
  chunkDateRange,
  INTER_EXTRATO_MAX_DAYS,
  ymdUtc,
} from './inter.auth';
import { mapInterExtratoToBankCredits } from './inter.extrato';
import { BANK_CREDIT_SOURCE } from './bank-credits';

describe('inter.auth chunkDateRange', () => {
  it('quebra intervalo longo em janelas de 90 dias', () => {
    const start = new Date(Date.UTC(2026, 0, 1, 12));
    const end = new Date(Date.UTC(2026, 7, 31, 12));
    const chunks = chunkDateRange(start, end, INTER_EXTRATO_MAX_DAYS);
    expect(chunks.length).toBeGreaterThan(1);
    expect(ymdUtc(chunks[0]!.inicio)).toBe('2026-01-01');
    expect(ymdUtc(chunks[chunks.length - 1]!.fim)).toBe('2026-08-31');
    for (const c of chunks) {
      const days =
        Math.round(
          (c.fim.getTime() - c.inicio.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1;
      expect(days).toBeLessThanOrEqual(INTER_EXTRATO_MAX_DAYS);
    }
  });
});

describe('mapInterExtratoToBankCredits', () => {
  it('mapeia só créditos para BankCredit INTER_API', () => {
    const credits = mapInterExtratoToBankCredits({
      transacoes: [
        {
          dataEntrada: '31/08/2026',
          tipoTransacao: 'PIX',
          tipoOperacao: 'C',
          valor: '3878.04',
          titulo: 'Pix recebido',
          descricao: 'Weg Equipamentos Eletricos S/a',
        },
        {
          dataEntrada: '31/08/2026',
          tipoTransacao: 'PIX',
          tipoOperacao: 'D',
          valor: '100.00',
          titulo: 'Pix enviado',
          descricao: 'Fornecedor',
        },
      ],
    });
    expect(credits).toHaveLength(1);
    expect(credits[0]!.amount).toBeCloseTo(3878.04, 2);
    expect(credits[0]!.counterparty).toContain('Weg');
    expect(credits[0]!.source).toBe(BANK_CREDIT_SOURCE.INTER_API);
  });
});
