'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { pedidosStatusBadgeStyle } from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';
import type { ExpeditionPedidosPreset } from '@/src/components/expedicao/workspace/pedidos-new-filter-modal';
import {
  deleteSavedFilter,
  loadSavedFilters,
  type SavedFilterPreset,
} from '@/src/lib/saved-filters';

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

export function PedidosOrderStatusFilters(props: {
  active: StatusFilterId;
  activeCustomFilterId: string | null;
  onChange: (id: StatusFilterId) => void;
  onApplyCustomFilter: (preset: ExpeditionPedidosPreset, filterId: string) => void;
  storageKey: string;
  savedFiltersVersion: number;
  onSavedFiltersChange: () => void;
}) {
  const {
    active,
    activeCustomFilterId,
    onChange,
    onApplyCustomFilter,
    storageKey,
    savedFiltersVersion,
    onSavedFiltersChange,
  } = props;

  const [customFilters, setCustomFilters] = useState<
    SavedFilterPreset<ExpeditionPedidosPreset>[]
  >([]);

  useEffect(() => {
    setCustomFilters(loadSavedFilters<ExpeditionPedidosPreset>(storageKey));
  }, [storageKey, savedFiltersVersion]);

  const handleDeleteCustom = (id: string) => {
    deleteSavedFilter(storageKey, id);
    setCustomFilters(loadSavedFilters<ExpeditionPedidosPreset>(storageKey));
    onSavedFiltersChange();
  };

  return (
    <div className="erp-filter-option-stack">
      {PEDIDOS_STATUS_FILTERS.map((f) => {
        const on = activeCustomFilterId === null && active === f.id;
        const tone = pedidosStatusFilterTone(f.id);
        const coloredStyle = pedidosStatusBadgeStyle(tone, on);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange(f.id)}
            className={`pedidos-filter-tag${on ? ' pedidos-filter-tag--active' : ''}${tone ? ` pedidos-filter-tag--${tone}` : ' pedidos-filter-tag--neutral'}`}
            style={coloredStyle}
          >
            {f.label}
          </button>
        );
      })}
      {customFilters.map((preset) => {
        const on = activeCustomFilterId === preset.id;
        const tone = pedidosStatusFilterTone(
          (preset.value.statusFilter ?? 'all') as StatusFilterId,
        );
        const coloredStyle = pedidosStatusBadgeStyle(tone, on);
        return (
          <div key={preset.id} className="erp-filter-custom-row">
            <button
              type="button"
              onClick={() => onApplyCustomFilter(preset.value, preset.id)}
              className={`pedidos-filter-tag erp-filter-custom-row-btn${on ? ' pedidos-filter-tag--active' : ''}${tone ? ` pedidos-filter-tag--${tone}` : ' pedidos-filter-tag--neutral'}`}
              style={coloredStyle}
            >
              {preset.name}
            </button>
            <button
              type="button"
              className="erp-filter-custom-row-delete"
              aria-label={`Excluir filtro ${preset.name}`}
              onClick={() => handleDeleteCustom(preset.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
