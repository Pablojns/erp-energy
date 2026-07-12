import type { PedidosFilterField, StatusFilterId } from '@/src/components/expedicao/shared/types';

export type PedidosSourceTab = 'WEG' | 'SITE' | 'VENDA_EXTERNA';

export type PedidosSortOrder = 'asc' | 'desc';

export type ExpeditionPedidosPreset = {
  source: PedidosSourceTab;
  statusFilter: StatusFilterId;
  filterField: PedidosFilterField;
  filterValue: string;
  sortBy: string;
  sortOrder: PedidosSortOrder;
};

export const DEFAULT_PEDIDOS_SORT_BY = 'orderDate';
export const DEFAULT_PEDIDOS_SORT_ORDER: PedidosSortOrder = 'desc';

export function normalizeExpeditionPedidosPreset(
  preset: Partial<ExpeditionPedidosPreset> & { statusFilter?: StatusFilterId },
): ExpeditionPedidosPreset {
  return {
    source: preset.source ?? 'WEG',
    statusFilter: preset.statusFilter ?? 'all',
    filterField: preset.filterField ?? '',
    filterValue: preset.filterValue ?? '',
    sortBy: preset.sortBy ?? DEFAULT_PEDIDOS_SORT_BY,
    sortOrder: preset.sortOrder ?? DEFAULT_PEDIDOS_SORT_ORDER,
  };
}

export function pedidosFiltersStorageKey(userId: string): string {
  return `erp.filters.expedicao.pedidos.${userId}`;
}
