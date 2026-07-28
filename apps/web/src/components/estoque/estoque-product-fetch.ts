import { erpFetchJson } from '@/src/services/api/erp-fetch';
import type { BusinessContext } from '@/src/lib/business-context';

export type EstoqueBulkProduct = {
  id: string;
  sku: string;
  name: string;
  stockQty: number;
  reservedQty?: number;
  availableQty?: number;
  price: string;
  cost: string | null;
  category: string | null;
  internalCode?: string | null;
  isActive: boolean;
};

type PaginatedProducts = {
  data: EstoqueBulkProduct[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export async function fetchAllStockProducts(opts: {
  businessContext?: BusinessContext;
  includeInactive?: boolean;
}): Promise<EstoqueBulkProduct[]> {
  const allRows: EstoqueBulkProduct[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '100');
    params.set('sortBy', 'name');
    params.set('sortOrder', 'asc');
    if (!opts.includeInactive) params.set('status', 'active');
    if (opts.businessContext === 'WEG' || opts.businessContext === 'SITE') {
      params.set('businessContext', opts.businessContext);
    }
    const res = await erpFetchJson<PaginatedProducts>(
      `products?${params.toString()}`,
    );
    allRows.push(...res.data);
    totalPages = res.meta.totalPages;
    page += 1;
  } while (page <= totalPages);
  return allRows;
}
