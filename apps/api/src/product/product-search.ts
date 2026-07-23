import type { Prisma } from '@erp/database';

/**
 * Normaliza texto de busca de produtos: minúsculas, sem acento, só alfanumérico.
 */
export function normalizeProductSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim();
}

/** Tokens individuais da busca (ordem irrelevante). */
export function splitProductSearchTokens(search: string): string[] {
  const normalized = normalizeProductSearchText(search);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/** Tokens com este tamanho ou menos exigem palavra completa exata. */
export const PRODUCT_SEARCH_SHORT_TOKEN_MAX = 3;

type StringFilterField =
  | 'name'
  | 'internalCode'
  | 'sku'
  | 'supplierSku'
  | 'category';

/**
 * Cláusulas Prisma que aproximam "palavra completa" em um campo string
 * (separadores: espaço, hífen, " - ").
 * Evita que "g" case em "G2"/"GG"/"polo" via contains parcial.
 */
function fieldWholeWordClauses(
  field: StringFilterField,
  token: string,
): Prisma.ProductWhereInput[] {
  const mode = 'insensitive' as const;
  return [
    { [field]: { equals: token, mode } },
    { [field]: { startsWith: `${token} `, mode } },
    { [field]: { startsWith: `${token}-`, mode } },
    { [field]: { endsWith: ` ${token}`, mode } },
    { [field]: { endsWith: `-${token}`, mode } },
    { [field]: { contains: ` ${token} `, mode } },
    { [field]: { contains: ` ${token}-`, mode } },
    { [field]: { contains: `-${token} `, mode } },
    { [field]: { contains: `-${token}-`, mode } },
    { [field]: { contains: ` - ${token} `, mode } },
    { [field]: { contains: ` - ${token}-`, mode } },
  ] as Prisma.ProductWhereInput[];
}

function categoryWholeWordClauses(token: string): Prisma.ProductWhereInput[] {
  const mode = 'insensitive' as const;
  return [
    { productCategory: { name: { equals: token, mode } } },
    { productCategory: { name: { startsWith: `${token} `, mode } } },
    { productCategory: { name: { startsWith: `${token}-`, mode } } },
    { productCategory: { name: { endsWith: ` ${token}`, mode } } },
    { productCategory: { name: { endsWith: `-${token}`, mode } } },
    { productCategory: { name: { contains: ` ${token} `, mode } } },
    { productCategory: { name: { contains: ` ${token}-`, mode } } },
    { productCategory: { name: { contains: `-${token} `, mode } } },
    { productCategory: { name: { contains: `-${token}-`, mode } } },
    { productCategory: { name: { contains: ` - ${token} `, mode } } },
    { productCategory: { name: { contains: ` - ${token}-`, mode } } },
  ];
}

function tokenFieldClause(token: string): Prisma.ProductWhereInput {
  const short = token.length <= PRODUCT_SEARCH_SHORT_TOKEN_MAX;

  if (!short) {
    return {
      OR: [
        { name: { contains: token, mode: 'insensitive' } },
        { internalCode: { contains: token, mode: 'insensitive' } },
        { sku: { contains: token, mode: 'insensitive' } },
        { supplierSku: { contains: token, mode: 'insensitive' } },
        { category: { contains: token, mode: 'insensitive' } },
        {
          productCategory: {
            name: { contains: token, mode: 'insensitive' },
          },
        },
      ],
    };
  }

  return {
    OR: [
      ...fieldWholeWordClauses('name', token),
      ...fieldWholeWordClauses('internalCode', token),
      ...fieldWholeWordClauses('sku', token),
      ...fieldWholeWordClauses('supplierSku', token),
      ...fieldWholeWordClauses('category', token),
      ...categoryWholeWordClauses(token),
    ],
  };
}

/**
 * Busca inteligente de Product: todas as palavras devem bater
 * (em qualquer campo / qualquer ordem).
 * Tokens curtos = palavra completa; longos = substring em algum campo.
 */
export function buildProductSmartSearchWhere(
  search: string | null | undefined,
): Prisma.ProductWhereInput | undefined {
  const tokens = splitProductSearchTokens(search ?? '');
  if (tokens.length === 0) return undefined;
  if (tokens.length === 1) return tokenFieldClause(tokens[0]!);
  return { AND: tokens.map((token) => tokenFieldClause(token)) };
}
