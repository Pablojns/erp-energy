/** Contexto operacional global do ERP (Multi-CNPJ). */
export const BUSINESS_CONTEXTS = ['WEG', 'SITE', 'ALL'] as const;
export type BusinessContext = (typeof BUSINESS_CONTEXTS)[number];

/** Preferência padrão de login (sem "Todos"). */
export type DefaultBusinessContext = 'WEG' | 'SITE';

export const BUSINESS_CONTEXT_LABEL: Record<BusinessContext, string> = {
  WEG: 'WEG/SP',
  SITE: 'Site/Londrina',
  ALL: 'Todos',
};

/** Source de pedidos quando o contexto filtra; ALL → sem filtro de source. */
export const BUSINESS_CONTEXT_ORDER_SOURCE: Record<
  BusinessContext,
  string
> = {
  WEG: 'WEG_MERCADO_ELETRONICO',
  SITE: 'SITE',
  ALL: 'all',
};

export function isBusinessContext(value: unknown): value is BusinessContext {
  return value === 'WEG' || value === 'SITE' || value === 'ALL';
}

export function isFilteredBusinessContext(
  value: unknown,
): value is DefaultBusinessContext {
  return value === 'WEG' || value === 'SITE';
}

export function businessContextStorageKey(userId: string): string {
  return `erp.businessContext.${userId}`;
}
