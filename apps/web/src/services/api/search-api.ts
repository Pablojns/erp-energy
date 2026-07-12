import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type GlobalSearchResponse = {
  orders: SearchResultItem[];
  products: SearchResultItem[];
  customers: SearchResultItem[];
};

export async function searchGlobal(query: string, signal?: AbortSignal): Promise<GlobalSearchResponse> {
  const q = query.trim();
  if (!q) {
    return { orders: [], products: [], customers: [] };
  }
  const params = new URLSearchParams({ q });
  return erpFetchJson<GlobalSearchResponse>(`search?${params.toString()}`, { signal });
}
