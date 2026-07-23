/**
 * Busca inteligente de produtos do estoque (client-side).
 * Espelha a semântica de `buildProductSmartSearchWhere` no backend:
 * todas as palavras devem aparecer, em qualquer ordem.
 *
 * Tokens curtos (≤3): correspondência exata a uma palavra completa
 * (evita "p" casar dentro de "polo").
 * Tokens longos (4+): substring dentro de alguma palavra.
 */

export type ProductSearchable = {
  sku: string;
  name: string;
  internalCode?: string | null;
};

/** Tokens com este tamanho ou menos exigem palavra completa exata. */
export const PRODUCT_SEARCH_SHORT_TOKEN_MAX = 3;

export function normalizeProductSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function splitProductSearchTokens(search: string): string[] {
  const normalized = normalizeProductSearchText(search);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/** Divide texto em palavras completas (espaço, hífen e demais separadores). */
export function splitProductWords(value: string): string[] {
  return normalizeProductSearchText(value).split(/\s+/).filter(Boolean);
}

function productNameWords(product: ProductSearchable): string[] {
  return splitProductWords(product.name);
}

function productSearchWords(product: ProductSearchable): string[] {
  const words = productNameWords(product);
  const sku = normalizeProductSearchText(product.sku);
  const internal = product.internalCode
    ? normalizeProductSearchText(product.internalCode)
    : '';
  const extra = [sku, internal].filter(Boolean);
  return [...extra, ...words];
}

/**
 * Curto (≤3): palavra === token.
 * Longo (4+): token é substring de alguma palavra completa.
 */
export function tokenMatchesWord(token: string, word: string): boolean {
  if (token.length <= PRODUCT_SEARCH_SHORT_TOKEN_MAX) {
    return word === token;
  }
  return word.includes(token);
}

export function productMatchesSearch(
  product: ProductSearchable,
  query: string,
): boolean {
  const tokens = splitProductSearchTokens(query);
  if (tokens.length === 0) return true;
  const words = productSearchWords(product);
  return tokens.every((token) =>
    words.some((word) => tokenMatchesWord(token, word)),
  );
}

function compareProductsByName(a: ProductSearchable, b: ProductSearchable): number {
  return (
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) ||
    a.sku.localeCompare(b.sku, 'pt-BR', { sensitivity: 'base' })
  );
}

function productSearchRank(product: ProductSearchable, query: string): number {
  const tokens = splitProductSearchTokens(query);
  if (tokens.length === 0) return 0;

  const nameWords = productNameWords(product);
  const firstToken = tokens[0] ?? '';
  const firstWord = nameWords[0] ?? '';

  if (firstToken && firstWord && tokenMatchesWord(firstToken, firstWord)) {
    return 0;
  }
  return 1;
}

export function sortProductsForSearch<T extends ProductSearchable>(
  products: T[],
  query: string,
): T[] {
  const tokens = splitProductSearchTokens(query);
  const matches = tokens.length
    ? products.filter((product) => productMatchesSearch(product, query))
    : [...products];

  return matches.sort((a, b) => {
    if (!tokens.length) return compareProductsByName(a, b);
    return (
      productSearchRank(a, query) - productSearchRank(b, query) ||
      compareProductsByName(a, b)
    );
  });
}
