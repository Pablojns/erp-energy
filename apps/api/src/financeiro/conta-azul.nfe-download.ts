import { inflateRawSync } from 'node:zlib';
import { invoiceNumberDigits } from '../orders/order-search';
import { extractDocumentoNumero } from './conta-azul.titulos';

export const CA_NF_NOT_SYNCED_MESSAGE =
  'Nota ainda não sincronizada — rode a sincronização da Conta Azul';

/** Número da NF sem série (`1 - 1881` → `1881`). */
export function nfNumberKey(raw: string | number | null | undefined): string {
  return invoiceNumberDigits(String(raw ?? '')).replace(/^0+/, '');
}

/** Regex POSIX do PostgreSQL (~*) para NF-e/NF na descrição, sem substring de pedido WEG. */
export function invoiceDescricaoMatchPattern(
  invoiceNumber: string,
): string | null {
  const n = nfNumberKey(invoiceNumber);
  if (!n || !/^\d+$/.test(n)) return null;
  return `(^|[^0-9a-z])nf[-.[:space:]]*e?[[:space:]]*[:.]?[[:space:]]*0*${n}([^0-9]|$)`;
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

export function danfeDownloadFilename(numero: string): string {
  const key = nfNumberKey(numero) || 'nota';
  return `DANFE-${key}.pdf`;
}

export function nfeStorageKey(
  orderId: string,
  numero: string,
  kind: 'xml' | 'danfe',
): string {
  const nf = nfNumberKey(numero) || 'nota';
  return kind === 'danfe' ? `nfe/${orderId}/${nf}.pdf` : `nfe/${orderId}/${nf}.xml`;
}

function looksLikeNfeXml(content: Buffer): boolean {
  const head = content.subarray(0, 400).toString('utf8');
  return (
    /<\?xml/i.test(head) ||
    /<nfeProc[\s>]/i.test(head) ||
    /<NFe[\s>]/i.test(head)
  );
}

function xmlScore(name: string, content: Buffer): number {
  const lower = name.toLowerCase();
  let score = 0;
  if (lower.endsWith('.xml') || looksLikeNfeXml(content)) score += 10;
  if (/procnfe|nfeproc/i.test(lower) || /<nfeProc[\s>]/i.test(content.toString('utf8'))) {
    score += 5;
  }
  if (/evento|procEvento|cancel/i.test(lower)) score -= 8;
  return score;
}

/** Extrai o primeiro XML de NF-e de um ZIP simples (deflate/store). */
export function extractFirstXmlFromZip(buffer: Buffer): string {
  let offset = 0;
  let best: { score: number; xml: string } | null = null;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig === 0x02014b50 || sig === 0x06054b50) break;
    if (sig !== 0x04034b50) {
      throw new Error('Arquivo ZIP da Conta Azul está corrompido ou não é um ZIP válido.');
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    if (dataStart + compSize > buffer.length) {
      throw new Error('Arquivo ZIP da Conta Azul está incompleto.');
    }
    const compressed = buffer.subarray(dataStart, dataStart + compSize);
    let content: Buffer;
    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      content = inflateRawSync(compressed);
    } else {
      offset = dataStart + compSize;
      if (flags & 0x8) {
        offset += buffer.readUInt32LE(offset) === 0x08074b50 ? 16 : 12;
      }
      continue;
    }
    const score = xmlScore(name, content);
    if (score > (best?.score ?? 0)) {
      best = { score, xml: content.toString('utf8') };
    }
    offset = dataStart + compSize;
    if (flags & 0x8) {
      offset += buffer.readUInt32LE(offset) === 0x08074b50 ? 16 : 12;
    }
  }
  if (!best || best.score < 10) {
    throw new Error('XML da NF-e não encontrado no ZIP da Conta Azul.');
  }
  return best.xml;
}

export function extractNfeXml(buffer: Buffer): string {
  const kind = detectCaNfFile(buffer);
  if (kind.ext === 'pdf') {
    throw new Error('A Conta Azul devolveu PDF, não XML da NF-e.');
  }
  if (kind.ext === 'zip') {
    return extractFirstXmlFromZip(buffer);
  }
  return buffer.toString('utf8');
}

/** A lib de DANFE espera nfeProc; XML cru da CA às vezes vem só com <NFe>. */
export function normalizeNfeXml(xml: string): string {
  const trimmed = xml.replace(/^\uFEFF/, '').trim();
  if (/<nfeProc[\s>]/i.test(trimmed)) return trimmed;
  const nfeMatch = trimmed.match(/<NFe[\s>][\s\S]*<\/NFe>/i);
  if (nfeMatch) {
    return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfeMatch[0]}</nfeProc>`;
  }
  return trimmed;
}

export async function xmlToDanfePdf(xml: string): Promise<Buffer> {
  const { gerarPDF } = await import('@alexssmusica/node-pdf-nfe');
  const doc = await gerarPDF(normalizeNfeXml(xml), { notEndDocument: true });
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    doc.on('data', (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.from(chunk));
    });
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });
  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 5 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error('A conversão XML → DANFE não gerou um PDF válido.');
  }
  return buffer;
}
