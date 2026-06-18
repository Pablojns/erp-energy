import {
  getEnabledExpeditionStatusFilters,
  type ExpeditionStatusFilterConfig,
} from '@/src/components/expedicao/shared/expedition-status-filters';
import type { FilterFormState, StatusFilterId } from '@/src/components/expedicao/shared/types';

export const INITIAL_FILTERS: FilterFormState = {
  search: '',
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

export type StatusFilterDef = {
  id: StatusFilterId;
  label: string;
  icon: ExpeditionStatusFilterConfig['icon'];
  tone: ExpeditionStatusFilterConfig['color'];
  hint: string;
};

function toStatusFilterDef(c: ExpeditionStatusFilterConfig): StatusFilterDef {
  return {
    id: c.key,
    label: c.label,
    icon: c.icon,
    tone: c.color,
    hint: c.hint ?? '',
  };
}

/** Derivado de `expeditionStatusFilters` (habilitados). */
export const STATUS_FILTERS: StatusFilterDef[] =
  getEnabledExpeditionStatusFilters().map(toStatusFilterDef);
