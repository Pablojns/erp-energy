import {
  buildSaidaHojeProduto,
  mapSaidaHojeHeaders,
  rowValuesForColumns,
  saidaHojeDedupKey,
  sortSaidaHojeRows,
  sortSaidaHojeSheetLines,
  type SaidaHojeRow,
} from './saida-hoje-sheets.service';

describe('SaidaHojeSheets helpers', () => {
  it('monta Produto como SKU - Nome', () => {
    expect(buildSaidaHojeProduto('ABC', 'Caneta')).toBe('ABC - Caneta');
    expect(buildSaidaHojeProduto('', 'Caneta')).toBe('Caneta');
    expect(buildSaidaHojeProduto('ABC', '')).toBe('ABC');
  });

  it('chave de dedupe Numero Ped + Seq', () => {
    expect(saidaHojeDedupKey('4518999999', 10)).toBe('4518999999::10');
    expect(saidaHojeDedupKey(' 4518 ', ' 20 ')).toBe('4518::20');
  });

  it('mapeia cabeçalho real da aba SAIDA HOJE', () => {
    const map = mapSaidaHojeHeaders([
      'Numero Ped',
      'Data Pedido',
      'DATA ENTREGA',
      'Seq.',
      'Produto (SKU - Nome)',
      'Quantidade',
      'CNPJ Entrega',
      'Ponto Descarga',
      'Recebedor',
      'Status ME',
      'Status CA',
      'Nota Fiscal',
      'Valor Total',
      'OBSERVAÇÃO',
    ]);
    expect(map.numeroPed).toBe(0);
    expect(map.dataPedido).toBe(1);
    expect(map.dataEntrega).toBe(2);
    expect(map.seq).toBe(3);
    expect(map.produto).toBe(4);
    expect(map.quantidade).toBe(5);
    expect(map.cnpjEntrega).toBe(6);
    expect(map.pontoDescarga).toBe(7);
    expect(map.recebedor).toBe(8);
    expect(map.notaFiscal).toBe(11);
  });

  it('serializa linha e preserva colunas extras no update', () => {
    const map = mapSaidaHojeHeaders([
      'Numero Ped',
      'Data Pedido',
      'DATA ENTREGA',
      'Seq.',
      'Produto (SKU - Nome)',
      'Quantidade',
      'CNPJ Entrega',
      'Ponto Descarga',
      'Recebedor',
      'Status ME',
      'Status CA',
      'Nota Fiscal',
      'Valor Total',
      'OBSERVAÇÃO',
    ]);
    const row: SaidaHojeRow = {
      numeroPed: '4518123456',
      dataPedido: '12/08/2026',
      dataEntrega: '10/08/2026',
      seq: 10,
      produto: 'SKU-1 - Caneta Plástica',
      quantidade: 12,
      cnpjEntrega: '07.175.725/0010-50',
      pontoDescarga: 'PORTARIA',
      recebedor: 'FULANO',
      notaFiscal: '',
    };
    const prev = Array.from({ length: 14 }, () => '');
    prev[9] = 'Sem recebimento';
    prev[10] = 'Não Encontrado';
    prev[11] = '2208';
    prev[12] = 'R$ 10,00';
    const cells = rowValuesForColumns(row, map, 14, prev);
    expect(cells[0]).toBe('4518123456');
    expect(cells[3]).toBe('10');
    expect(cells[4]).toBe('SKU-1 - Caneta Plástica');
    expect(cells[8]).toBe('FULANO');
    expect(cells[9]).toBe('Sem recebimento');
    expect(cells[11]).toBe('2208');
  });

  it('ordena linhas misturadas por pedido e, dentro do pedido, por seq', () => {
    const rows = sortSaidaHojeRows([
      row('200', 20),
      row('100', 30),
      row('200', 10),
      row('100', 10),
    ]);
    expect(rows.map((r) => `${r.numeroPed}:${r.seq}`)).toEqual([
      '100:10',
      '100:30',
      '200:10',
      '200:20',
    ]);
  });

  it('reordena a aba inteira por Numero Ped e Seq, levando a nota fiscal junto', () => {
    const lines = sortSaidaHojeSheetLines(
      [
        ['200', '30', 'NF-200'],
        ['100', '20', 'NF-100'],
        ['', '', ''],
        ['300', '5', ''],
        ['100', '2', ''],
        ['200', '10', ''],
      ],
      0,
      1,
    );
    expect(lines.map((line) => `${line[0]}:${line[1]}:${line[2]}`)).toEqual([
      '100:2:',
      '100:20:NF-100',
      '200:10:',
      '200:30:NF-200',
      '300:5:',
    ]);
  });

  it('trata Seq como número (2 antes de 10) e deixa linha sem pedido no fim', () => {
    const lines = sortSaidaHojeSheetLines(
      [
        ['100', '10', 'a'],
        ['100', '2', 'b'],
        ['', '', 'observação'],
      ],
      0,
      1,
    );
    expect(lines.map((line) => `${line[0]}:${line[1]}:${line[2]}`)).toEqual([
      '100:2:b',
      '100:10:a',
      '::observação',
    ]);
  });
});

function row(numeroPed: string, seq: number): SaidaHojeRow {
  return {
    numeroPed,
    seq,
    cnpjEntrega: '',
    produto: 'SKU',
    quantidade: 1,
    pontoDescarga: '',
    recebedor: '',
  };
}
