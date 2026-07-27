import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

const PEDIDOS_STATUS_FILTERS: Array<{
  id: StatusFilterId;
  label: string;
}> = [
  { id: 'all', label: 'Todos' },
  { id: 'novo', label: 'Novo' },
  { id: 'em_separacao', label: 'Em Separação' },
  { id: 'aguardando_nf', label: 'Aguardando NF' },
  { id: 'finalizado', label: 'Finalizado' },
  { id: 'cancelado', label: 'Cancelado' },
];

export function pedidosStatusFilterLabel(id: StatusFilterId): string {
  if (id === 'parcial') return 'Parcial';
  if (id === 'urgente') return 'Urgente';
  return PEDIDOS_STATUS_FILTERS.find((f) => f.id === id)?.label ?? id;
}

export function pedidosStatusFilterTone(id: StatusFilterId): string | undefined {
  switch (id) {
    case 'novo':
      return 'novo';
    case 'em_separacao':
      return 'em_separacao';
    case 'aguardando_nf':
      return 'aguardando_nf';
    case 'finalizado':
      return 'finalizado';
    case 'parcial':
      return 'parcial';
    case 'cancelado':
      return 'cancelado';
    case 'urgente':
      return 'urgente';
    default:
      return undefined;
  }
}
