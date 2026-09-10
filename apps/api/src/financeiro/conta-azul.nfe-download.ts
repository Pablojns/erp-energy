import { invoiceDigits } from './conta-azul.auth';
import { extractDocumentoNumero } from './conta-azul.titulos';

export const CA_NF_NOT_SYNCED_MESSAGE =
  'Nota ainda não sincronizada — rode a sincronização da Conta Azul';

export function nfNumberKey(raw: string | number | null | undefined): string {
  return invoiceDigits(raw).replace(/^0+/, '');
}

export function tituloMatchesInvoiceNumber(
  titulo: { numero: string | null; descricao: string },
  invoiceNumber: string,
): boolean {
  const wanted = nfNumberKey(invoiceNumber);
  if (!wanted) return false;
  if (nfNumberKey(titulo.numero) === wanted) return true;
  return nfNumberKey(extractDocumentoNumero(null, titulo.descricao)) === wanted;
}

export function detectCaNfFile(buffer: Buffer): {
  ext: 'xml' | 'zip' | 'pdf';
  mime: string;
} {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    return { ext: 'zip', mime: 'application/zip' };
  }
  return { ext: 'xml', mime: 'application/xml' };
}

export function nfeDownloadFilename(numero: string, ext: string): string {
  const key = nfNumberKey(numero) || 'nota';
  return `NF-${key}.${ext}`;
}
