'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import type {
  FilterFormState,
  StatusFilterId,
} from '@/src/components/expedicao/shared/types';

type CarrierOption = { id: string; name: string; isActive: boolean };

export const SEPARATION_STAGE_FILTERS: Array<{
  id: StatusFilterId;
  label: string;
}> = [
  { id: 'all', label: 'Todas as etapas' },
  { id: 'sep_em_separacao', label: 'Em separação' },
  { id: 'sep_falta_nf', label: 'Já separado, falta NF' },
  { id: 'sep_falta_etiqueta', label: 'Falta colar etiqueta' },
  { id: 'sep_aguardando_saida', label: 'Aguardando saída' },
];

/** Filtros da fila de separação: etapa + busca + transportadora + ponto de descarga. */
export function SeparationQueueFilters(props: {
  filters: FilterFormState;
  statusFilter: StatusFilterId;
  onChange: (patch: Partial<FilterFormState>) => void;
  onStatusFilterChange: (id: StatusFilterId) => void;
}) {
  const { filters, statusFilter, onChange, onStatusFilterChange } = props;
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [points, setPoints] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => {
        if (active) setCarriers(rows.filter((c) => c.isActive));
      })
      .catch(() => {
        if (active) setCarriers([]);
      });
    void erpFetchJson<string[]>('orders/filters/unloading-points')
      .then((rows) => {
        if (active) setPoints(rows);
      })
      .catch(() => {
        if (active) setPoints([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasFilters = Boolean(
    statusFilter !== 'all' ||
      filters.search.trim() ||
      filters.carrierName.trim() ||
      filters.unloadingPoint.trim(),
  );

  return (
    <div className="exp-sep-filters">
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilterId)}
        className="exp-queue-filter-select shrink-0"
        aria-label="Filtrar por etapa da separação"
      >
        {SEPARATION_STAGE_FILTERS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      <div className="exp-queue-search-wrap min-w-0 flex-1">
        <Search className="exp-queue-search-icon" aria-hidden />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          placeholder="Buscar pedido, NF, recebedor..."
          className="exp-queue-search exp-queue-search--compact"
          aria-label="Buscar na fila de separação"
        />
      </div>

      <select
        value={filters.carrierName}
        onChange={(e) => onChange({ carrierName: e.target.value })}
        className="exp-queue-filter-select shrink-0"
        aria-label="Filtrar por transportadora"
      >
        <option value="">Todas as transportadoras</option>
        {carriers.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={filters.unloadingPoint}
        onChange={(e) => onChange({ unloadingPoint: e.target.value })}
        className="exp-queue-filter-select shrink-0"
        aria-label="Filtrar por ponto de descarga"
      >
        <option value="">Todos os pontos de descarga</option>
        {points.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      {hasFilters ? (
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-transparent text-[var(--text-primary)] transition hover:bg-gray-100"
          onClick={() => {
            onStatusFilterChange('all');
            onChange({ search: '', carrierName: '', unloadingPoint: '' });
          }}
          aria-label="Limpar filtros da separação"
          title="Limpar filtros"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
