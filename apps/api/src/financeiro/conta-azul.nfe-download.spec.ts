import { deflateRawSync } from 'node:zlib';
import {
  danfeDownloadFilename,
  detectCaNfFile,
  extractFirstXmlFromZip,
  extractNfeXml,
  invoiceDescricaoMatchPattern,
  nfNumberKey,
  nfeDownloadFilename,
  normalizeNfeXml,
  tituloMatchesInvoiceNumber,
} from './conta-azul.nfe-download';

function zipWithStoredFile(name: string, content: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(content.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([header, nameBuf, content, central, nameBuf, eocd]);
}

function zipWithDeflatedFile(name: string, content: Buffer): Buffer {
  const compressed = deflateRawSync(content);
  const nameBuf = Buffer.from(name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(content.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([header, nameBuf, compressed, central, nameBuf, eocd]);
}

describe('conta-azul.nfe-download', () => {
  it('normaliza o número da NF ignorando zeros à esquerda', () => {
    expect(nfNumberKey('2070')).toBe('2070');
    expect(nfNumberKey('00002070')).toBe('2070');
    expect(nfNumberKey('1 - 1881')).toBe('1881');
    expect(nfNumberKey('1 - 2072')).toBe('2072');
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
    expect(danfeDownloadFilename('2070')).toBe('DANFE-2070.pdf');
  });

  it('extrai XML direto ou de ZIP (store/deflate)', () => {
    const xml = '<?xml version="1.0"?><nfeProc><NFe/></nfeProc>';
    expect(extractNfeXml(Buffer.from(xml))).toContain('nfeProc');
    expect(
      extractFirstXmlFromZip(zipWithStoredFile('nota.xml', Buffer.from(xml))),
    ).toContain('nfeProc');
    expect(
      extractNfeXml(zipWithDeflatedFile('procNFe.xml', Buffer.from(xml))),
    ).toContain('nfeProc');
  });

  it('envolve NFe solta em nfeProc', () => {
    const wrapped = normalizeNfeXml('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe/></NFe>');
    expect(wrapped).toContain('<nfeProc');
    expect(wrapped).toContain('</nfeProc>');
  });
});
