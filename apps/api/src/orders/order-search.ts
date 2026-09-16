import { Prisma } from '@erp/database';

/**
 * Lógica ÚNICA de busca textual de pedidos. Todas as telas (fila de pedidos,
 * separação, saídas, histórico de NF, busca global) devem usar estes helpers —
 * antes cada rota tinha sua própria regra (`startsWith` vs `contains`, campos
 * diferentes), o que fazia o mesmo termo achar em uma tela e não achar em outra.
 */

const INSENSITIVE = Prisma.QueryMode.insensitive;

/** Campos aceitos no filtro por coluna (dropdown "buscar por"). */
export const ORDER_FILTER_FIELDS = [
  'invoiceNumber',
  'receiverName',
  'unloadingPoint',
] as const;

export type OrderFilterField = (typeof ORDER_FILTER_FIELDS)[number];

export function isOrderFilterField(value: string): value is OrderFilterField {
  return (ORDER_FILTER_FIELDS as readonly string[]).includes(value);
}

/** Remove acentos para permitir "Jose" achar "José" (e vice-versa). */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Código de objeto Correios (ex.: AP373095360BR) — nunca é número de NF. */
export function isCorreiosTrackingCode(
  raw: string | null | undefined,
): boolean {
  const code = (raw ?? '').trim().toUpperCase().replace(/\s/g, '');
  return /^[A-Z]{2}\d{8,11}BR$/.test(code);
}

/** Parte isolada de um campo de NF (`1 - 1897` → `1897`, `12345/1` → `12345`). */
function invoiceNumberDigitsOnePart(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (isCorreiosTrackingCode(trimmed)) return '';
  let part = trimmed.split('/')[0]?.trim() ?? trimmed;
  const dashMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (dashMatch?.[2]) {
    part = dashMatch[2];
  } else {
    const trailing = part.match(/[-–—]\s*(\d+)\s*$/);
    if (trailing?.[1]) part = trailing[1];
  }
  return part.replace(/\D/g, '');
}

function splitInvoiceNumberParts(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (/[|,;]/.test(trimmed)) {
    return trimmed
      .split(/[|,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const repeated = trimmed.match(/\d+\s*[-–—]\s*\d+/g);
  if (repeated && repeated.length > 1) return repeated;
  return [trimmed];
}

/**
 * Dígitos de UM número de NF. Nunca concatena várias notas: se o campo
 * tiver mais de uma (`1 - 1764 | 1 - 1762`), devolve só a primeira.
 */
export function invoiceNumberDigits(raw: string): string {
  return invoiceNumberDigitList(raw)[0] ?? '';
}

/** Todos os números de NF de um campo (`1 - 1211 | 1 - 912` → `['1211','912']`). */
export function invoiceNumberDigitList(
  raw: string | null | undefined,
): string[] {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || isCorreiosTrackingCode(trimmed)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of splitInvoiceNumberParts(trimmed)) {
    const d = invoiceNumberDigitsOnePart(part);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

/** Exibição da NF: só o número (`1 - 1881` → `1881`). Várias notas: `1 - 1016 | 1 - 832` → `1016 | 832`. */
export function displayInvoiceNumber(raw: string | null | undefined): string {
  return invoiceNumberDigitList(raw).join(' | ');
}

/** Número do pedido visível ao usuário — nunca o código interno PED-XXX. */
export function displayPedidoNumero(order: {
  externalOrderNumber?: string | null;
  code?: string | null;
}): string {
  const ext = String(order.externalOrderNumber ?? '').trim();
  if (ext) return ext;
  const code = String(order.code ?? '').trim();
  if (!code || /^PED-\d+/i.test(code)) return '';
  return code;
}

export function sameInvoiceNumber(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = invoiceNumberDigits(String(a ?? ''));
  const right = invoiceNumberDigits(String(b ?? ''));
  if (left && right) return left === right;
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/** Tira uma NF de um campo que pode ter várias (`1889 | 1890`). */
export function removeInvoiceNumberFromField(
  current: string | null | undefined,
  toRemove: string | null | undefined,
): string | null {
  const raw = String(current ?? '').trim();
  if (!raw) return null;
  const wanted = invoiceNumberDigits(String(toRemove ?? ''));
  if (!wanted) return raw;
  const parts = splitInvoiceNumberParts(raw);
  const kept = parts.filter((part) => invoiceNumberDigitsOnePart(part) !== wanted);
  if (kept.length === parts.length) {
    return invoiceNumberDigitList(raw).includes(wanted) ? null : raw;
  }
  return kept.length ? kept.join(' | ') : null;
}

/**
 * True quando o número informado é a Nota de Remessa do pedido.
 * Remessa sai de outra conta Conta Azul — nunca deve ser usada como Nota de Venda
 * (XML/DANFE, cron, download manual).
 */
export function invoiceNumberMatchesRemessa(
  invoiceNumber: string | null | undefined,
  notaRemessa: string | null | undefined,
): boolean {
  const remessa = String(notaRemessa ?? '').trim();
  if (!remessa || isCorreiosTrackingCode(remessa)) return false;
  const inv = String(invoiceNumber ?? '').trim();
  if (!inv || isCorreiosTrackingCode(inv)) return false;
  return sameInvoiceNumber(inv, remessa);
}

/** Remessa preenchida e confirmada — documento que transporta a mercadoria. */
export function confirmedRemessaNumber(order: {
  notaRemessa?: string | null;
  notaRemessaConfirmada?: boolean | null;
}): string {
  if (!order.notaRemessaConfirmada) return '';
  const remessa = String(order.notaRemessa ?? '').trim();
  if (!remessa || isCorreiosTrackingCode(remessa)) return '';
  return remessa;
}

/** Termo cru → termo pesquisável (sem `#`, sem espaços nas pontas). */
export function normalizeOrderSearchTerm(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
}

/** Variantes do termo: com e sem acento (o Postgres não ignora acentuação). */
function termVariants(term: string): string[] {
  const stripped = stripAccents(term);
  return stripped === term ? [term] : [term, stripped];
}

const ACCENTABLE = /[aeiouc]/i;

/**
 * Termo digitado sem acento precisa achar o dado acentuado ("jose" → "José").
 * O Postgres não ignora acentuação e a extensão `unaccent` não está instalada,
 * então geramos variantes com UM curinga `_` por vez na posição de cada letra
 * acentuável — preciso o bastante para nomes com um acento (a grande maioria).
 */
function accentWildcardVariants(term: string): string[] {
  if (term.length < 3 || term.length > 12) return [];
  if (/\d/.test(term)) return [];
  if (stripAccents(term) !== term) return [];

  const variants: string[] = [];
  for (let i = 0; i < term.length; i += 1) {
    if (!ACCENTABLE.test(term[i]!)) continue;
    variants.push(`${term.slice(0, i)}_${term.slice(i + 1)}`);
  }
  return variants;
}

function containsAny(
  field:
    | 'externalOrderNumber'
    | 'code'
    | 'mercadoEletronicoNumber'
    | 'invoiceNumber'
    | 'notaRemessa'
    | 'receiverName'
    | 'customerName'
    | 'unloadingPoint'
    | 'deliveryCnpj'
    | 'customerDocument',
  terms: string[],
): Prisma.OrderWhereInput[] {
  return terms.map((term) => ({
    [field]: { contains: term, mode: INSENSITIVE },
  })) as Prisma.OrderWhereInput[];
}

function itemContainsAny(
  field: 'sku' | 'description',
  terms: string[],
): Prisma.OrderWhereInput[] {
  return terms.map((term) => ({
    items: { some: { [field]: { contains: term, mode: INSENSITIVE } } },
  })) as Prisma.OrderWhereInput[];
}

/**
 * `where` da busca livre de pedidos. Regra única: substring case-insensitive.
 * Número procura NF, nota de remessa, pedido e documento; texto procura
 * recebedor, cliente, ponto de descarga, número do pedido e itens.
 */
export function buildOrderSearchWhere(
  rawTerm: string | undefined | null,
): Prisma.OrderWhereInput {
  const term = normalizeOrderSearchTerm(rawTerm);
  if (!term) return {};

  const variants = termVariants(term);
  const digits = term.replace(/\D/g, '');
  const nfDigits = invoiceNumberDigits(term);
  // Curingas de acento só nos campos de texto livre (nomes e descrição).
  const textVariants = [...variants, ...accentWildcardVariants(term)];

  const or: Prisma.OrderWhereInput[] = [
    ...containsAny('externalOrderNumber', variants),
    ...containsAny('code', variants),
    ...containsAny('mercadoEletronicoNumber', variants),
    ...containsAny('invoiceNumber', variants),
    ...containsAny('notaRemessa', variants),
    ...containsAny('receiverName', textVariants),
    ...containsAny('customerName', textVariants),
    ...textVariants.map((term) => ({
      customer: { name: { contains: term, mode: INSENSITIVE } },
    })),
    ...containsAny('unloadingPoint', textVariants),
    ...itemContainsAny('sku', variants),
    ...itemContainsAny('description', textVariants),
  ];

  // NF digitada com série/sufixo ("1 - 1897", "1897/2") ou com pontuação.
  if (nfDigits && nfDigits !== term) {
    or.push(...containsAny('invoiceNumber', [nfDigits]));
    or.push(...containsAny('notaRemessa', [nfDigits]));
  }

  // CNPJ/CPF digitado com máscara.
  if (digits.length >= 3) {
    or.push(...containsAny('deliveryCnpj', [digits]));
    or.push(...containsAny('customerDocument', [digits]));
    or.push({
      customer: { document: { contains: digits, mode: INSENSITIVE } },
    });
  }

  return { OR: or };
}

/** `where` do filtro por coluna — mesma semântica da busca livre. */
export function buildOrderFieldFilterWhere(
  field: string | undefined | null,
  rawValue: string | undefined | null,
): Prisma.OrderWhereInput {
  const value = (rawValue ?? '').trim();
  const key = (field ?? '').trim();
  if (!value || !isOrderFilterField(key)) return {};

  const variants =
    key === 'invoiceNumber'
      ? termVariants(value)
      : [...termVariants(value), ...accentWildcardVariants(value)];
  const or: Prisma.OrderWhereInput[] = containsAny(key, variants);

  if (key === 'invoiceNumber') {
    const digits = invoiceNumberDigits(value);
    if (digits && digits !== value) {
      or.push(...containsAny('invoiceNumber', [digits]));
      or.push(...containsAny('notaRemessa', [digits]));
    } else {
      or.push(...containsAny('notaRemessa', variants));
    }
  }

  return or.length === 1 ? or[0]! : { OR: or };
}

/**
 * `where` de "lote parcial" — precisa existir no servidor para o contador e a
 * paginação refletirem o filtro (o refino no cliente continua afinando a lista).
 */
export function buildOrderParcialWhere(): Prisma.OrderWhereInput {
  return {
    AND: [
      { status: { notIn: ['FINALIZADO', 'EXPEDIDO', 'CANCELADO', 'ARQUIVADO'] } },
      {
        OR: [
          { status: 'PARCIAL' },
          {
            AND: [
              { items: { some: { pickedQty: { gt: 0 } } } },
              {
                items: {
                  some: {
                    OR: [{ pickedQty: 0 }, { missingQty: { gt: 0 } }],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}
