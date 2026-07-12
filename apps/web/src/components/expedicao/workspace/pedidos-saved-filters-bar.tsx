'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  normalizeExpeditionPedidosPreset,
  type ExpeditionPedidosPreset,
} from '@/src/components/expedicao/workspace/pedidos-saved-filter-types';
import { pedidosStatusBadgeStyle } from '@/src/components/expedicao/shared/pedidos-status-styles';
import { pedidosStatusFilterTone } from '@/src/components/expedicao/workspace/pedidos-order-status-filters';
import {
  deleteSavedFilter,
  loadSavedFilters,
  type SavedFilterPreset,
} from '@/src/lib/saved-filters';

export function PedidosSavedFiltersBar(props: {
  storageKey: string;
  savedFiltersVersion: number;
  activeCustomFilterId: string | null;
  onApply: (preset: ExpeditionPedidosPreset, filterId: string) => void;
  onDelete: (filterId: string) => void;
}) {
  const [saved, setSaved] = useState<SavedFilterPreset<ExpeditionPedidosPreset>[]>([]);

  useEffect(() => {
    setSaved(loadSavedFilters<ExpeditionPedidosPreset>(props.storageKey));
  }, [props.storageKey, props.savedFiltersVersion]);

  if (saved.length === 0) return null;

  const handleDelete = (id: string) => {
    deleteSavedFilter(props.storageKey, id);
    setSaved(loadSavedFilters<ExpeditionPedidosPreset>(props.storageKey));
    props.onDelete(id);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Salvos
      </span>
      {saved.map((preset) => {
        const normalized = normalizeExpeditionPedidosPreset(preset.value);
        const on = props.activeCustomFilterId === preset.id;
        const tone = pedidosStatusFilterTone(normalized.statusFilter);
        const coloredStyle = pedidosStatusBadgeStyle(tone, on);

        return (
          <div key={preset.id} className="erp-filter-custom-row">
            <button
              type="button"
              onClick={() => props.onApply(normalized, preset.id)}
              className={`pedidos-filter-tag erp-filter-custom-row-btn${on ? ' pedidos-filter-tag--active' : ''}${tone ? ` pedidos-filter-tag--${tone}` : ' pedidos-filter-tag--neutral'}`}
              style={coloredStyle}
            >
              {preset.name}
            </button>
            <button
              type="button"
              className="erp-filter-custom-row-delete"
              aria-label={`Excluir filtro ${preset.name}`}
              onClick={() => handleDelete(preset.id)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
