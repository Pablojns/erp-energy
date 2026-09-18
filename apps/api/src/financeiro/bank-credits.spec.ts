import * as fs from 'fs';
import {
  isWegBankPayer,
  parseBrBankAmount,
  parseBrBankDate,
  parseInterCsv,
  WEG_BANK_PAYER_TERMS,
} from './bank-credits';

function csvBuffer(body: string): Uint8Array {
  return new Uint8Array(Buffer.from(body, 'utf8'));
}

const SAMPLE = `Extrato Conta Corrente
Conta ;260609617
Período ;01/01/2026 a 31/08/2026
Saldo ;15.818,68

Data Lançamento;Histórico;Descrição;Valor;Saldo
31/08/2026;Pix recebido;Bytedance Brasil Tecnologia Ltda.;28,68;16.563,68
31/08/2026;Transferência recebida;@weg Tintas Ltda;333,34;16.535,00
31/08/2026;Pix recebido;Weg Equipamentos Eletricos S/a;3.878,04;16.201,66
31/08/2026;Pix recebido;Weg Turbinas Ltda;1.716,12;10.983,22
31/08/2026;Pix enviado ;Xia Bao Zhu;-65,08;9.267,10
28/08/2026;Pix recebido;Divisão Motores - Parque Fabril;500,00;1.000,00
`;

describe('bank-credits', () => {
  it('parseia valor brasileiro e ignora negativos', () => {
    expect(parseBrBankAmount('3.878,04')).toBeCloseTo(3878.04);
    expect(parseBrBankAmount('28,68')).toBeCloseTo(28.68);
    expect(parseBrBankAmount('-65,08')).toBeCloseTo(-65.08);
    expect(parseBrBankDate('31/08/2026')?.toISOString().slice(0, 10)).toBe(
      '2026-08-31',
    );
  });

  it('reconhece WEG, Turbinas, Tintas, Divisão Motores e Parque Fabril', () => {
    expect(isWegBankPayer('Weg Equipamentos Eletricos S/a')).toBe(true);
    expect(isWegBankPayer('Weg Turbinas Ltda')).toBe(true);
    expect(isWegBankPayer('@weg Tintas Ltda')).toBe(true);
    expect(isWegBankPayer('Divisão Motores')).toBe(true);
    expect(isWegBankPayer('Divisao Motores')).toBe(true);
    expect(isWegBankPayer('Parque Fabril I')).toBe(true);
    expect(isWegBankPayer('Bytedance Brasil Tecnologia Ltda.')).toBe(false);
    expect(isWegBankPayer('Appmax Plataforma Vendas Ltda')).toBe(false);
    expect(WEG_BANK_PAYER_TERMS).toContain('weg');
  });

  it('pula metadados, lê o cabeçalho e só devolve créditos', () => {
    const rows = parseInterCsv(csvBuffer(SAMPLE));
    expect(rows.map((r) => r.counterparty)).toEqual([
      'Bytedance Brasil Tecnologia Ltda.',
      '@weg Tintas Ltda',
      'Weg Equipamentos Eletricos S/a',
      'Weg Turbinas Ltda',
      'Divisão Motores - Parque Fabril',
    ]);
    expect(rows[2].amount).toBeCloseTo(3878.04);
    expect(rows[2].date.toISOString().slice(0, 10)).toBe('2026-08-31');
    expect(rows[2].source).toBe('INTER_CSV');
  });

  it('identifica pagamentos WEG reais no CSV anexado', () => {
    const path = 'C:/Users/SUNHUB/Downloads/Extrato-01-01-2026-a-31-08-2026-CSV.csv';
    if (!fs.existsSync(path)) return;
    const rows = parseInterCsv(new Uint8Array(fs.readFileSync(path)));
    const weg = rows.filter((r) => isWegBankPayer(r.counterparty));
    const names = [...new Set(weg.map((r) => r.counterparty))];
    expect(weg.length).toBeGreaterThan(600);
    expect(names.some((n) => /equipamentos eletric/i.test(n))).toBe(true);
    expect(names.some((n) => /turbinas/i.test(n))).toBe(true);
    expect(names.some((n) => /tintas/i.test(n))).toBe(true);
    expect(weg.every((r) => r.amount > 0)).toBe(true);
  });
});
