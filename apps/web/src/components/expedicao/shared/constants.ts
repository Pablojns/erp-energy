import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ClipboardList,
  FileText,
  Flame,
  Package,
  PackageCheck,
  Truck,
  Zap,
} from 'lucide-react';
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

export function countActiveFilters(f: FilterFormState): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.source !== 'all') n++;
  if (f.invoiceStatus !== 'all') n++;
  if (f.externalOrderNumber.trim()) n++;
  if (f.deliveryCnpj.trim()) n++;
  if (f.receiverName.trim()) n++;
  if (f.unloadingPoint.trim()) n++;
  if (f.sku.trim()) n++;
  if (f.contaAzulStatus.trim()) n++;
  if (f.invoiceNumber.trim()) n++;
  if (f.orderDateFrom.trim()) n++;
  if (f.orderDateTo.trim()) n++;
  if (f.deliveryDateFrom.trim()) n++;
  if (f.deliveryDateTo.trim()) n++;
  return n;
}

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

export const SEPARATION_FILTERS = [
  { id: 'all', label: 'Todos', icon: ClipboardList },
  { id: 'urgente', label: 'Urgente', icon: Flame },
  { id: 'parcial', label: 'Parcial', icon: AlertTriangle },
  { id: 'sem_estoque', label: 'Sem estoque', icon: Box },
  { id: 'completo', label: 'Completo', icon: CheckCircle2 },
] as const;

export function todayIsoDate(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function defaultWegTestHeader() {
  return {
    externalOrderNumber: '4518249493',
    mercadoEletronicoNumber: '61380468',
    customerName: 'Cliente WEG teste',
    customerDocument: '',
    deliveryCnpj: '84.584.994/0007-16',
    receiverName: 'HENRIQUE',
    unloadingPoint: 'MKT',
    orderDate: '',
    requestedDeliveryDate: '',
    notes: '',
  };
}

export function defaultWegTestLines() {
  return [
    {
      tempId: crypto.randomUUID(),
      lineNumber: 10,
      sku: '50020124',
      description: 'CADERNO PADRAO BRANDING PAPEL',
      quantity: 50,
      unit: 'UN',
      ncm: '4820.20.00',
      unitPrice: 24.22,
    },
  ];
}

export const KPI_DEFS = [
  { key: 'pedidosHoje', label: 'Pedidos hoje', ring: 'sky' as const, icon: Package },
  { key: 'urgentes', label: 'Urgentes', ring: 'orange' as const, icon: Flame },
  { key: 'emSeparacao', label: 'Em separação', ring: 'violet' as const, icon: Zap },
  { key: 'parciais', label: 'Parciais', ring: 'amber' as const, icon: AlertTriangle },
  { key: 'comFalta', label: 'Com falta', ring: 'orange' as const, icon: Box },
  { key: 'aguardandoNf', label: 'Aguardando NF', ring: 'indigo' as const, icon: FileText },
  { key: 'saidasHoje', label: 'Saídas hoje', ring: 'emerald' as const, icon: Truck },
  { key: 'reservados', label: 'Reservados', ring: 'sky' as const, icon: PackageCheck },
] as const;
