import type { FilterFormState } from '@/src/components/expedicao/shared/types';

export const INITIAL_FILTERS: FilterFormState = {
  search: '',
  filterField: '',
  filterValue: '',
  source: 'all',
  invoiceStatus: 'all',
  externalOrderNumber: '',
  deliveryCnpj: '',
  receiverName: '',
  unloadingPoint: '',
  sku: '',
  contaAzulStatus: '',
  invoiceNumber: '',
  orderDateFrom: '',
  orderDateTo: '',
  deliveryDateFrom: '',
  deliveryDateTo: '',
};
