import {
  detectCaNfFile,
  nfNumberKey,
  nfeDownloadFilename,
  tituloMatchesInvoiceNumber,
} from './conta-azul.nfe-download';

describe('conta-azul.nfe-download', () => {
  it('normaliza o número da NF ignorando zeros à esquerda', () => {
    expect(nfNumberKey('2070')).toBe('2070');
    expect(nfNumberKey('00002070')).toBe('2070');
  });

  it('relaciona título sincronizado pelo NF-e da descrição', () => {
    expect(
      tituloMatchesInvoiceNumber(
        { numero: null, descricao: 'Venda 4519084083 / NF-e:2070' },
        '2070',
      ),
    ).toBe(true);
    expect(
      tituloMatchesInvoiceNumber(
        { numero: null, descricao: 'Venda 1 / NF-e:12070' },
        '2070',
      ),
    ).toBe(false);
  });

  it('detecta XML, ZIP e PDF pelo conteúdo', () => {
    expect(detectCaNfFile(Buffer.from('<?xml version="1.0"?>')).ext).toBe('xml');
    expect(detectCaNfFile(Buffer.from('%PDF-1.4')).ext).toBe('pdf');
    expect(detectCaNfFile(Buffer.from([0x50, 0x4b, 0x03, 0x04])).ext).toBe('zip');
  });

  it('monta o nome do arquivo', () => {
    expect(nfeDownloadFilename('2070', 'xml')).toBe('NF-2070.xml');
  });
});
