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

function tokenFieldClause(token: string): Prisma.ProductWhereInput {
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

/**
 * Busca inteligente de Product: todas as palavras devem bater
 * (em qualquer campo / qualquer ordem).
 */
export function buildProductSmartSearchWhere(
  search: string | null | undefined,
): Prisma.ProductWhereInput | undefined {
  const tokens = splitProductSearchTokens(search ?? '');
  if (tokens.length === 0) return undefined;
  if (tokens.length === 1) return tokenFieldClause(tokens[0]!);
  return { AND: tokens.map((token) => tokenFieldClause(token)) };
}
