'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategoryPieChart } from '@/src/components/financeiro/category-pie-chart';
import {
  FinFilterOptionButton,
  FinFilterOptionGroup,
  FinFiltersDropdown,
} from '@/src/components/financeiro/fin-filters-dropdown';
import { NovaDespesaModal } from '@/src/components/financeiro/modals';
import { FinPieSkeleton, FinTableSkeleton } from '@/src/components/financeiro/skeletons';
import type { Despesa, DespesaCategoria, FinanceiroPeriod } from '@/src/components/financeiro/types';
import { DESPESA_CATEGORIAS } from '@/src/components/financeiro/types';
import {
  buildFinanceiroPeriodQuery,
  categoriaLabel,
  formatCurrency,
  formatDateBr,
  groupDespesasByCategoria,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export function FinanceiroDespesasTab(props: {
  period: FinanceiroPeriod;
  refreshToken: number;
}) {
  const { period, refreshToken } = props;
  const [rows, setRows] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoriaFilter, setCategoriaFilter] = useState<'ALL' | DespesaCategoria>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await erpFetchJson<Despesa[]>(
        `api/financeiro/despesas${buildFinanceiroPeriodQuery(period)}`,
      );
      setRows(res);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar despesas.');
    } finally {
      setLoading(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filtered = useMemo(() => {
    if (categoriaFilter === 'ALL') return rows;
    return rows.filter((d) => d.categoria === categoriaFilter);
  }, [rows, categoriaFilter]);

  const activeFilterCount = categoriaFilter !== 'ALL' ? 1 : 0;

  const slices = useMemo(() => groupDespesasByCategoria(filtered), [filtered]);
  const total = filtered.reduce((acc, d) => acc + d.valor, 0);

  const handleCreate = async (payload: {
    descricao: string;
    categoria: string;
    valor: string;
    data: string;
    fornecedor?: string;
    observacao?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await erpFetchJson('api/financeiro/despesas', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar despesa.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta despesa?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await erpFetchJson(`api/financeiro/despesas/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao excluir despesa.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <FinTableSkeleton rows={6} />
        <FinPieSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="overflow-visible">
          <FinFiltersDropdown
            activeCount={activeFilterCount}
            title="Filtrar despesas"
            onClear={() => setCategoriaFilter('ALL')}
          >
          <FinFilterOptionGroup label="Categoria">
            <FinFilterOptionButton
              active={categoriaFilter === 'ALL'}
              onClick={() => setCategoriaFilter('ALL')}
            >
              Todas
            </FinFilterOptionButton>
            {DESPESA_CATEGORIAS.map((c) => (
              <FinFilterOptionButton
                key={c}
                active={categoriaFilter === c}
                onClick={() => setCategoriaFilter(c)}
              >
                {categoriaLabel(c)}
              </FinFilterOptionButton>
            ))}
          </FinFilterOptionGroup>
          </FinFiltersDropdown>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
          style={{ background: 'var(--fin-accent)' }}
        >
          <Plus className="h-4 w-4" />
          Nova despesa
        </button>
      </div>

      {error ? (
        <p className="shrink-0 text-sm text-[var(--fin-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[1.6fr_1fr]">
        <div className="fin-card flex min-h-0 flex-col overflow-hidden rounded-2xl">
          <div
            className="shrink-0 border-b px-4 py-3"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            <h2 className="text-sm font-semibold text-[var(--fin-text)]">Lançamentos</h2>
          </div>
          <div className="lista-container erp-scrollbar overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-xs sm:text-sm">
              <thead
                className="sticky top-0 z-[1] text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]"
                style={{ background: 'var(--fin-card-muted)' }}
              >
                <tr className="border-b" style={{ borderColor: 'var(--fin-border)' }}>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-[var(--fin-text-muted)]"
                    >
                      Nenhuma despesa no período.
                    </td>
                  </tr>
                ) : (
                  filtered.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b transition hover:bg-[var(--fin-card-muted)]"
                      style={{ borderColor: 'var(--fin-border)' }}
                    >
                      <td className="px-4 py-3 text-[var(--fin-text-secondary)]">
                        {formatDateBr(d.data)}
                      </td>
                      <td className="px-4 py-3 font-medium text-[var(--fin-text)]">
                        {d.descricao}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{
                            background: 'var(--fin-card-muted)',
                            color: 'var(--fin-text-secondary)',
                          }}
                        >
                          {categoriaLabel(d.categoria)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--fin-danger)]">
                        {formatCurrency(d.valor)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={deletingId === d.id}
                          onClick={() => void handleDelete(d.id)}
                          className="inline-flex items-center rounded-lg border p-1.5 disabled:opacity-50"
                          style={{
                            borderColor: 'color-mix(in srgb, var(--fin-danger) 35%, transparent)',
                            color: 'var(--fin-danger)',
                          }}
                          aria-label="Excluir despesa"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div
            className="flex shrink-0 flex-col gap-1 border-t px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: 'var(--fin-border)' }}
          >
            <span className="text-[var(--fin-text-muted)]">
              {filtered.length} despesa(s) no período
            </span>
            <span className="font-semibold tabular-nums text-[var(--fin-text)]">
              Total: {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="fin-card lista-container rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-[var(--fin-text)]">
            Distribuição por categoria
          </h2>
          <div className="mt-4">
            <CategoryPieChart slices={slices} />
          </div>
        </div>
      </div>

      <NovaDespesaModal
        open={modalOpen}
        loading={saving}
        onClose={() => setModalOpen(false)}
        onConfirm={(p) => void handleCreate(p)}
      />
    </div>
  );
}

export function despesasToCsvRows(rows: Despesa[]): string[][] {
  return rows.map((d) => [
    formatDateBr(d.data),
    d.descricao,
    categoriaLabel(d.categoria),
    d.fornecedor ?? '',
    String(d.valor),
  ]);
}

export const DESPESAS_CSV_HEADERS = [
  'Data',
  'Descrição',
  'Categoria',
  'Fornecedor',
  'Valor',
];
