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

/**
 * Dígitos de um número de NF: descarta série (`1 - 1897`), sufixo (`1897/2`) e
 * qualquer pontuação. Fonte única — o espelho no front está em
 * `apps/web/src/services/api/pedidos-normalize.ts`.
 */
export function invoiceNumberDigits(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (isCorreiosTrackingCode(trimmed)) return '';

  let part = trimmed.split('/')[0]?.trim() ?? trimmed;
  const dashMatch = part.match(/[-–—]\s*(.+)$/);
  if (dashMatch?.[1]) {
    part = dashMatch[1].trim();
  }
  return part.replace(/\D/g, '');
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
