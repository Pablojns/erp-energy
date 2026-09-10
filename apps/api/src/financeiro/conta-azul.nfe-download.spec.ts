import {
  detectCaNfFile,
  invoiceDescricaoMatchPattern,
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
    expect(
      tituloMatchesInvoiceNumber(
        { numero: null, descricao: 'Venda 4519082159 / NF-e:2070' },
        '2159',
      ),
    ).toBe(false);
    expect(
      tituloMatchesInvoiceNumber(
        { numero: null, descricao: 'Venda 4519 / NF-e:2159' },
        '2159',
      ),
    ).toBe(true);
  });

  it('monta padrão POSIX da descrição com o número da NF', () => {
    const pattern = invoiceDescricaoMatchPattern('2159');
    expect(pattern).toContain('2159');
    expect(pattern).toContain('nf');
    expect(invoiceDescricaoMatchPattern('abc')).toBeNull();
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
