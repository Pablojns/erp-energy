import type { FilterFormState, StatusFilterId } from '@/src/components/expedicao/shared/types';

export function applyStatusFilter(
  filter: StatusFilterId,
  params: URLSearchParams,
  mode: 'expedition' | 'separation' = 'expedition',
) {
  if (mode === 'separation') {
    params.set('workspace', 'separation');
    return;
  }

  switch (filter) {
    case 'all':
      break;
    case 'novo':
      params.set('status', 'NOVO');
      break;
    case 'urgente':
      params.set('status', 'urgent');
      break;
    case 'atrasado':
      params.set('status', 'delayed');
      break;
    case 'aguardando_nf':
      params.set('status', 'AGUARDANDO_NF');
      break;
    case 'parcial':
      params.set('status', 'PARCIAL');
      break;
    case 'aguardando_estoque':
      params.set('workspace', 'pendencies');
      break;
    case 'pronto_separacao':
      params.set('status', 'RESERVADO');
      break;
    case 'em_separacao':
      params.set('status', 'EM_SEPARACAO');
      break;
    case 'finalizado':
      params.set('status', 'FINALIZADO');
      break;
    case 'cancelado':
      params.set('status', 'CANCELADO');
      break;
  }
}

export function buildFilterParams(opts: {
  appliedFilters: FilterFormState;
  searchDebounced: string;
  statusFilter: StatusFilterId;
  mode?: 'expedition' | 'separation';
  separationSubFilter?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  const f = opts.appliedFilters;

  applyStatusFilter(opts.statusFilter, params, opts.mode ?? 'expedition');

  if (f.source !== 'all') params.set('source', f.source);
  if (f.invoiceStatus !== 'all') params.set('invoiceStatus', f.invoiceStatus);
  if (f.externalOrderNumber.trim())
    params.set('externalOrderNumber', f.externalOrderNumber.trim());
  if (f.deliveryCnpj.trim()) params.set('deliveryCnpj', f.deliveryCnpj.trim());
  if (f.receiverName.trim()) params.set('receiverName', f.receiverName.trim());
  if (f.unloadingPoint.trim())
    params.set('unloadingPoint', f.unloadingPoint.trim());
  if (f.sku.trim()) params.set('sku', f.sku.trim());
  if (f.contaAzulStatus.trim())
    params.set('contaAzulStatus', f.contaAzulStatus.trim());
  if (f.invoiceNumber.trim()) params.set('invoiceNumber', f.invoiceNumber.trim());
  if (f.orderDateFrom.trim()) params.set('orderDateFrom', f.orderDateFrom.trim());
  if (f.orderDateTo.trim()) params.set('orderDateTo', f.orderDateTo.trim());
  if (f.deliveryDateFrom.trim())
    params.set('deliveryDateFrom', f.deliveryDateFrom.trim());
  if (f.deliveryDateTo.trim())
    params.set('deliveryDateTo', f.deliveryDateTo.trim());
  if (opts.searchDebounced.trim()) params.set('search', opts.searchDebounced.trim());
  if (f.filterField && f.filterValue.trim()) {
    params.set('filterField', f.filterField);
    params.set('filterValue', f.filterValue.trim());
  }

  if (opts.mode === 'separation' && opts.separationSubFilter === 'urgente') {
    params.set('status', 'urgent');
  }

  params.set('sortBy', 'orderDate');
  params.set('sortOrder', 'desc');
  return params;
}

export function clientRefineOrders<
  T extends {
    status: string;
    priority: number;
    unidadesFaltantes?: number;
    requestedDeliveryDate?: string | null;
  },
>(
  orders: T[],
  statusFilter: StatusFilterId,
  separationSubFilter?: string,
  isOverdue?: (o: T) => boolean,
): T[] {
  let list = orders;
  if (statusFilter === 'novo') {
    list = list.filter((o) => o.status === 'NOVO' || o.status === 'ANALISADO');
  }
  if (statusFilter === 'atrasado' && isOverdue) {
    list = list.filter(isOverdue);
  }
  if (separationSubFilter === 'parcial') {
    list = list.filter((o) => o.status === 'PARCIAL');
  }
  if (separationSubFilter === 'sem_estoque') {
    list = list.filter((o) => (o.unidadesFaltantes ?? 0) > 0);
  }
  if (separationSubFilter === 'completo') {
    list = list.filter((o) => (o.unidadesFaltantes ?? 0) === 0);
  }
  if (separationSubFilter === 'urgente') {
    list = list.filter((o) => o.priority <= 2);
  }
  return list;
}
