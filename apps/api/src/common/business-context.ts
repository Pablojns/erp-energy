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

/** Valores de Product.origin aceitos por contexto filtrado. */
export const PRODUCT_ORIGINS_BY_CONTEXT: Record<
  DefaultBusinessContext,
  string[]
> = {
  WEG: ['WEG', 'WEG_MERCADO_ELETRONICO', 'SP', 'SAO_PAULO'],
  SITE: ['SITE', 'LONDRINA'],
};

export function isBusinessContext(value: unknown): value is BusinessContext {
  return value === 'WEG' || value === 'SITE' || value === 'ALL';
}

export function isFilteredBusinessContext(
  value: unknown,
): value is DefaultBusinessContext {
  return value === 'WEG' || value === 'SITE';
}

/** Aline e variações → padrão Site/Londrina. */
export function resolveDefaultBusinessContext(input: {
  name?: string | null;
  email?: string | null;
}): DefaultBusinessContext {
  const hay = `${input.name ?? ''} ${input.email ?? ''}`.toLowerCase();
  if (hay.includes('aline')) return 'SITE';
  return 'WEG';
}
