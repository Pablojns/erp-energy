import {
  buildSaidaHojeProduto,
  mapSaidaHojeHeaders,
  rowValuesForColumns,
  saidaHojeDedupKey,
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

  it('mapeia cabeçalhos esperados da aba SAIDA HOJE', () => {
    const map = mapSaidaHojeHeaders([
      'Numero Ped',
      'CNPJ Entrega',
      'Produto (SKU - Nome)',
      'Quantidade',
      'Ponto Descarga',
      'Recebedor',
      'Seq.',
      'Nota Fiscal',
    ]);
    expect(map.numeroPed).toBe(0);
    expect(map.cnpjEntrega).toBe(1);
    expect(map.produto).toBe(2);
    expect(map.quantidade).toBe(3);
    expect(map.pontoDescarga).toBe(4);
    expect(map.recebedor).toBe(5);
    expect(map.seq).toBe(6);
    expect(map.notaFiscal).toBe(7);
  });

  it('serializa linha nas colunas mapeadas', () => {
    const map = mapSaidaHojeHeaders([
      'Numero Ped',
      'CNPJ Entrega',
      'Produto (SKU - Nome)',
      'Quantidade',
      'Ponto Descarga',
      'Recebedor',
      'Seq.',
      'Nota Fiscal',
    ]);
    const row: SaidaHojeRow = {
      numeroPed: '4518123456',
      cnpjEntrega: '07.175.725/0010-50',
      produto: 'SKU-1 - Caneta Plástica',
      quantidade: 12,
      pontoDescarga: 'PORTARIA',
      recebedor: 'FULANO',
      seq: 10,
      notaFiscal: '',
    };
    expect(rowValuesForColumns(row, map, 8)).toEqual([
      '4518123456',
      '07.175.725/0010-50',
      'SKU-1 - Caneta Plástica',
      '12',
      'PORTARIA',
      'FULANO',
      '10',
      '',
    ]);
  });
});
