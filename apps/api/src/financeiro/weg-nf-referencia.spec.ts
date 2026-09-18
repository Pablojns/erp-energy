import * as XLSX from 'xlsx';
import {
  extractWegNfFromReferencia,
  parseWegPagamentosPlanilha,
  parseWegPlanilhaAmount,
  parseWegPlanilhaDate,
} from './weg-nf-referencia';
import * as fs from 'fs';

function workbookFromAoa(aoa: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
}

describe('weg-nf-referencia', () => {
  it('extrai NF da Referência SAP (zeros à esquerda + sufixo -1)', () => {
    expect(extractWegNfFromReferencia('000001081-1')).toBe('1081');
    expect(extractWegNfFromReferencia('000002106-1')).toBe('2106');
    expect(extractWegNfFromReferencia('000000981-1')).toBe('981');
    expect(extractWegNfFromReferencia('')).toBeNull();
  });

  it('usa valor absoluto do montante', () => {
    expect(parseWegPlanilhaAmount(-1708.44)).toBeCloseTo(1708.44);
    expect(parseWegPlanilhaAmount('-17,919.00')).toBeCloseTo(17919);
    expect(parseWegPlanilhaAmount('1,708.44')).toBeCloseTo(1708.44);
  });

  it('interpreta data US 1/14/26 e 12/25/25', () => {
    expect(parseWegPlanilhaDate('1/14/26')?.toISOString().slice(0, 10)).toBe(
      '2026-01-14',
    );
    expect(parseWegPlanilhaDate('12/25/25')?.toISOString().slice(0, 10)).toBe(
      '2025-12-25',
    );
    expect(parseWegPlanilhaDate('9/8/26')?.toISOString().slice(0, 10)).toBe(
      '2026-09-08',
    );
  });

  it('processa cada Referência e ignora linha sem NF (doc de compensação)', () => {
    const buf = workbookFromAoa([
      [
        'Referência',
        'Nº documento',
        'Vencimento líquido',
        'Montante em moeda interna',
        'Data do documento',
        'Doc.compensação',
        'Data de pagamento',
        'Data de compensação',
      ],
      ['', '2001008405', '9/8/26', '1,708.44', '9/8/26', '2001008405', '', ''],
      [
        '000002106-1',
        '5100425975',
        '9/6/26',
        '-1,708.44',
        '8/27/26',
        '2001008405',
        '9/8/26',
        '9/8/26',
      ],
      [
        '000002087-1',
        '5100451691',
        '9/6/26',
        '-24.22',
        '8/27/26',
        '2001008405',
        '9/8/26',
        '9/8/26',
      ],
    ]);
    const rows = parseWegPagamentosPlanilha(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      invoiceDigits: '2106',
      docCompensacao: '2001008405',
    });
    expect(rows[0].valor).toBeCloseTo(1708.44);
    expect(rows[0].pagoEm?.toISOString().slice(0, 10)).toBe('2026-09-08');
    expect(rows[1].invoiceDigits).toBe('2087');
  });

  it('usa vencimento líquido quando a planilha não tem Data de pagamento', () => {
    const buf = workbookFromAoa([
      [
        'Referência',
        'Nº documento',
        'Vencimento líquido',
        'Montante em moeda interna',
        'Data do documento',
        'Doc.compensação',
      ],
      ['000002118-1', '5100112325', '9/10/26', '-500.01', '8/31/26', '2000497726'],
    ]);
    const rows = parseWegPagamentosPlanilha(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].invoiceDigits).toBe('2118');
    expect(rows[0].pagoEm?.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(rows[0].valor).toBeCloseTo(500.01);
  });

  it('lê a planilha real Notas Pagas Energy quando o arquivo existe', () => {
    const path = 'C:/Users/SUNHUB/Downloads/Notas Pagas Energy (1).XLSX';
    if (!fs.existsSync(path)) return;
    const buf = new Uint8Array(fs.readFileSync(path));
    const rows = parseWegPagamentosPlanilha(buf);
    expect(rows.length).toBe(743);
    expect(rows[0].invoiceDigits).toBe('981');
    expect(rows[0].valor).toBeCloseTo(17919);
    expect(rows[0].pagoEm?.toISOString().slice(0, 10)).toBe('2026-01-14');
    const grouped = new Map<string, number>();
    for (const r of rows) {
      if (!r.docCompensacao) continue;
      grouped.set(r.docCompensacao, (grouped.get(r.docCompensacao) ?? 0) + 1);
    }
    expect([...grouped.values()].filter((n) => n > 1).length).toBe(44);
  });

  it('lê o EXPORT SAP (linhas sem Referência + sem coluna de pagamento)', () => {
    const path = 'C:/Users/SUNHUB/Downloads/EXPORT_20260918_102101.xlsx';
    if (!fs.existsSync(path)) return;
    const buf = new Uint8Array(fs.readFileSync(path));
    const rows = parseWegPagamentosPlanilha(buf);
    expect(rows.length).toBe(41);
    expect(rows[0].invoiceDigits).toBe('2106');
    expect(rows[0].docCompensacao).toBe('2001008405');
    expect(rows.filter((r) => r.docCompensacao === '2000487308')).toHaveLength(4);
  });
});
