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
});
