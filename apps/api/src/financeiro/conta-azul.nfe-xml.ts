import { serializeStoredDeliveryAddress } from '../common/delivery-address';
import { documentDigits } from './conta-azul.pessoas';

export type NfeXmlItem = {
  nItem: number;
  sku: string;
  description: string;
  ncm: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type NfeXmlDados = {
  invoiceNumber: string;
  chave: string | null;
  emitidaEm: string | null;
  saiuEm: string | null;
  volumes: number | null;
  emitCnpj: string | null;
  destDocumento: string | null;
  destNome: string | null;
  destEnderecoJson: string | null;
  destCidade: string | null;
  destUf: string | null;
  total: number;
  items: NfeXmlItem[];
};

function innerTag(xml: string, name: string): string | null {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,
    'i',
  );
  const m = xml.match(re);
  return m?.[1] != null ? m[1].trim() : null;
}

function allBlocks(xml: string, name: string): string[] {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${name}\\b([^>]*)>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`,
    'gi',
  );
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out.push(m[2] ?? '');
  }
  return out;
}

function attr(openOrBlock: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = openOrBlock.match(re);
  return m?.[1]?.trim() || null;
}

function asMoney(raw: string | null | undefined): number {
  if (raw == null || raw === '') return 0;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function asQty(raw: string | null | undefined): number {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : 0;
}

function text(xml: string, name: string): string | null {
  const v = innerTag(xml, name);
  if (v == null) return null;
  const cleaned = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return cleaned.length ? cleaned : null;
}

function destDocumento(dest: string): string | null {
  const cnpj = documentDigits(text(dest, 'CNPJ'));
  if (cnpj.length >= 11) return cnpj;
  const cpf = documentDigits(text(dest, 'CPF'));
  return cpf.length >= 11 ? cpf : null;
}

function destEndereco(dest: string): {
  json: string | null;
  cidade: string | null;
  uf: string | null;
} {
  const ender = innerTag(dest, 'enderDest') ?? dest;
  const logradouro = text(ender, 'xLgr');
  const cidade = text(ender, 'xMun');
  const uf = text(ender, 'UF')?.toUpperCase() ?? null;
  if (!logradouro || !cidade || !uf) {
    return { json: null, cidade, uf };
  }
  return {
    json: serializeStoredDeliveryAddress({
      cep: documentDigits(text(ender, 'CEP')),
      logradouro,
      numero: text(ender, 'nro') || 'S/N',
      complemento: text(ender, 'xCpl') || '',
      bairro: text(ender, 'xBairro') || '',
      cidade,
      uf,
    }),
    cidade,
    uf,
  };
}

function parseChave(xml: string): string | null {
  const inf = xml.match(/<(?:[\w-]+:)?infNFe\b([^>]*)>/i)?.[1] ?? '';
  const id = attr(inf, 'Id') ?? '';
  const fromId = id.replace(/^NFe/i, '').replace(/\D/g, '');
  if (fromId.length === 44) return fromId;
  const digits = id.replace(/\D/g, '');
  return digits.length >= 44 ? digits.slice(-44) : null;
}

function parseVolumes(inf: string): number | null {
  const vols = allBlocks(inf, 'vol');
  let sum = 0;
  for (const vol of vols) {
    sum += asQty(text(vol, 'qVol'));
  }
  if (sum > 0) return sum;
  const qVol = asQty(text(inf, 'qVol'));
  return qVol > 0 ? qVol : null;
}

function parseDet(block: string, fallbackNItem: number): NfeXmlItem | null {
  const prod = innerTag(block, 'prod') ?? block;
  const description = text(prod, 'xProd');
  if (!description) return null;
  const nItemAttr = block.match(/\bnItem\s*=\s*"(\d+)"/i)?.[1];
  const nItem = Number(nItemAttr) || fallbackNItem;
  const qty = asQty(text(prod, 'qCom') ?? text(prod, 'qTrib'));
  const totalPrice = asMoney(text(prod, 'vProd'));
  const unitPriceRaw = asMoney(text(prod, 'vUnCom') ?? text(prod, 'vUnTrib'));
  const unitPrice =
    unitPriceRaw > 0
      ? unitPriceRaw
      : qty > 0
        ? Math.round((totalPrice / qty) * 100) / 100
        : totalPrice;
  return {
    nItem,
    sku: text(prod, 'cProd') ?? '',
    description,
    ncm: text(prod, 'NCM'),
    unit: text(prod, 'uCom') ?? text(prod, 'uTrib'),
    quantity: qty > 0 ? qty : 1,
    unitPrice,
    totalPrice: totalPrice > 0 ? totalPrice : unitPrice * (qty > 0 ? qty : 1),
  };
}

/** Extrai cabeçalho + itens de um XML de NF-e (nfeProc ou NFe). */
export function parseNfeXml(xml: string): NfeXmlDados | null {
  const trimmed = String(xml ?? '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  const nfe = innerTag(trimmed, 'NFe') ?? trimmed;
  const inf = innerTag(nfe, 'infNFe') ?? nfe;
  const ide = innerTag(inf, 'ide') ?? inf;
  const invoiceNumber = (text(ide, 'nNF') ?? '').replace(/\D/g, '').replace(/^0+/, '');
  const detBlocks = allBlocks(inf, 'det');
  const items = detBlocks
    .map((block, idx) => parseDet(block, idx + 1))
    .filter((item): item is NfeXmlItem => Boolean(item));
  if (!invoiceNumber && items.length === 0) return null;

  const dest = innerTag(inf, 'dest') ?? '';
  const emit = innerTag(inf, 'emit') ?? '';
  const total = innerTag(inf, 'total') ?? '';
  const icmsTot = innerTag(total, 'ICMSTot') ?? total;
  const endereco = dest ? destEndereco(dest) : { json: null, cidade: null, uf: null };

  return {
    invoiceNumber: invoiceNumber || '',
    chave: parseChave(trimmed),
    emitidaEm: text(ide, 'dhEmi') ?? text(ide, 'dEmi'),
    saiuEm: text(ide, 'dhSaiEnt') ?? text(ide, 'dSaiEnt'),
    volumes: parseVolumes(inf),
    emitCnpj: documentDigits(text(emit, 'CNPJ')) || null,
    destDocumento: dest ? destDocumento(dest) : null,
    destNome: dest ? text(dest, 'xNome') : null,
    destEnderecoJson: endereco.json,
    destCidade: endereco.cidade,
    destUf: endereco.uf,
    total: asMoney(text(icmsTot, 'vNF') ?? text(icmsTot, 'vProd')),
    items,
  };
}

export function nfeEmitidaEmDate(raw: string | null | undefined): Date | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}
