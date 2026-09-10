import {
  atrasoTone,
  buyerCnpj,
  diasAtrasoFromDue,
  dueDateFromEmissao,
  formatCnpj,
  groupContasEmAtraso,
  resolveNfLines,
  tituloCompletouXDiasAtraso,
  type ContaAtrasoTitulo,
} from './contas-atraso';

function titulo(
  partial: Partial<ContaAtrasoTitulo> & { cnpj: string; cnpjKey: string },
): ContaAtrasoTitulo {
  return {
    id: partial.id ?? '1',
    invoiceNumber: partial.invoiceNumber ?? '100',
    pedido: partial.pedido ?? 'PED-1',
    cnpj: partial.cnpj,
    cnpjKey: partial.cnpjKey,
    valor: partial.valor ?? 100,
    dataEmissao: partial.dataEmissao ?? '2026-01-01T12:00:00.000Z',
    dueDate: partial.dueDate ?? '2026-01-13T12:00:00.000Z',
    diasAtraso: partial.diasAtraso ?? 1,
    tone: partial.tone ?? atrasoTone(partial.diasAtraso ?? 1),
  };
}

describe('contas-atraso', () => {
  it('vence 12 dias após a emissão', () => {
    const emissao = new Date('2026-01-01T15:00:00.000Z');
    const due = dueDateFromEmissao(emissao);
    expect(due.toISOString().slice(0, 10)).toBe('2026-01-13');
  });

  it('dias de atraso só contam após o vencimento', () => {
    const due = new Date('2026-01-13T12:00:00.000Z');
    expect(diasAtrasoFromDue(due, new Date('2026-01-13T18:00:00.000Z'))).toBe(0);
    expect(diasAtrasoFromDue(due, new Date('2026-01-20T18:00:00.000Z'))).toBe(7);
  });

  it('amarelo 7–30, vermelho acima de 30', () => {
    expect(atrasoTone(6)).toBe('normal');
    expect(atrasoTone(7)).toBe('atencao');
    expect(atrasoTone(30)).toBe('atencao');
    expect(atrasoTone(31)).toBe('critico');
  });

  it('formata e agrupa pelo CNPJ do comprador, não pelo recebedor', () => {
    expect(formatCnpj('07175725001484')).toBe('07.175.725/0014-84');
    expect(buyerCnpj('07.175.725/0014-84', '99')).toEqual({
      cnpj: '07.175.725/0014-84',
      cnpjKey: '07175725001484',
    });

    const grupos = groupContasEmAtraso([
      titulo({
        cnpj: '07.175.725/0014-84',
        cnpjKey: '07175725001484',
        diasAtraso: 40,
        valor: 2800,
        id: 'a1',
        invoiceNumber: 'NF-1',
        tone: 'critico',
      }),
      titulo({
        cnpj: '07.175.725/0014-84',
        cnpjKey: '07175725001484',
        diasAtraso: 12,
        valor: 700,
        id: 'a2',
        invoiceNumber: 'NF-2',
        tone: 'atencao',
      }),
      titulo({
        cnpj: '11.111.111/0001-11',
        cnpjKey: '11111111000111',
        diasAtraso: 8,
        valor: 50,
        tone: 'atencao',
      }),
    ]);
    expect(grupos.map((g) => g.cnpj)).toEqual([
      '07.175.725/0014-84',
      '11.111.111/0001-11',
    ]);
    expect(grupos[0].titulos).toBe(2);
    expect(grupos[0].valorTotal).toBe(3500);
    expect(grupos[0].diasAtrasoMaisAntigo).toBe(40);
  });

  it('usa o valor de cada OrderExit, nunca o total do pedido', () => {
    const lines = resolveNfLines({
      invoiceNumber: '2040',
      fallbackValor: 3500,
      fallbackEmissao: new Date('2026-09-01T12:00:00.000Z'),
      exits: [
        {
          invoiceNumber: '1936',
          invoiceValue: 2800,
          exitDate: new Date('2026-07-14T12:00:00.000Z'),
        },
        {
          invoiceNumber: '2040',
          invoiceValue: 700,
          exitDate: new Date('2026-09-09T12:00:00.000Z'),
        },
      ],
    });
    expect(lines).toEqual([
      {
        invoiceNumber: '1936',
        valor: 2800,
        dataEmissao: new Date('2026-07-14T12:00:00.000Z'),
      },
      {
        invoiceNumber: '2040',
        valor: 700,
        dataEmissao: new Date('2026-09-09T12:00:00.000Z'),
      },
    ]);
    expect(lines.some((l) => l.valor === 3500)).toBe(false);
  });

  it('alerta quando o título completa X dias de atraso', () => {
    expect(tituloCompletouXDiasAtraso(0, 1)).toBe(false);
    expect(tituloCompletouXDiasAtraso(1, 1)).toBe(true);
    expect(tituloCompletouXDiasAtraso(11, 12)).toBe(false);
    expect(tituloCompletouXDiasAtraso(12, 12)).toBe(true);
  });
});
