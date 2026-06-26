'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NovaDespesaModal } from '@/src/components/financeiro/modals';
import { FinanceiroPeriodSelector } from '@/src/components/financeiro/period-selector';
import type { Despesa, PeriodPreset } from '@/src/components/financeiro/types';
import {
  categoriaLabel,
  categoriaTone,
  formatCurrency,
  formatDateBr,
  formatYmd,
  resolvePeriodRange,
} from '@/src/components/financeiro/utils';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export function FinanceiroDespesasTab() {
  const today = formatYmd(new Date());
  const defaultRange = resolvePeriodRange('mes');

  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [customInicio, setCustomInicio] = useState(defaultRange.dataInicio);
  const [customFim, setCustomFim] = useState(defaultRange.dataFim);
  const [rows, setRows] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const range = useMemo(
    () =>
      resolvePeriodRange(preset, {
        dataInicio: customInicio || today,
        dataFim: customFim || today,
      }),
    [preset, customInicio, customFim, today],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        dataInicio: range.dataInicio,
        dataFim: range.dataFim,
      });
      const res = await erpFetchJson<Despesa[]>(
        `api/financeiro/despesas?${qs.toString()}`,
      );
      setRows(res);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Erro ao carregar despesas.');
    } finally {
      setLoading(false);
    }
  }, [range.dataInicio, range.dataFim]);

  useEffect(() => {
    if (preset === 'personalizado' && (!customInicio || !customFim)) return;
    void load();
  }, [load, preset, customInicio, customFim]);

  const total = rows.reduce((acc, d) => acc + d.valor, 0);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <FinanceiroPeriodSelector
          preset={preset}
          customInicio={customInicio}
          customFim={customFim}
          onPresetChange={setPreset}
          onCustomInicioChange={setCustomInicio}
          onCustomFimChange={setCustomFim}
        />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova despesa
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        <div className="erp-scrollbar overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 bg-[#0d1320] text-zinc-400">
                <th className="px-3 py-2.5 font-semibold">Data</th>
                <th className="px-3 py-2.5 font-semibold">Descrição</th>
                <th className="px-3 py-2.5 font-semibold">Categoria</th>
                <th className="px-3 py-2.5 font-semibold">Fornecedor</th>
                <th className="px-3 py-2.5 font-semibold text-right">Valor</th>
                <th className="px-3 py-2.5 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-zinc-500">
                    Nenhuma despesa no período.
                  </td>
                </tr>
              ) : (
                rows.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2.5 text-zinc-400">
                      {formatDateBr(d.data)}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-200">{d.descricao}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge
                        label={categoriaLabel(d.categoria)}
                        tone={categoriaTone(d.categoria)}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">
                      {d.fornecedor ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-400">
                      {formatCurrency(d.valor)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={deletingId === d.id}
                        onClick={() => void handleDelete(d.id)}
                        className="inline-flex items-center rounded-md border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                        aria-label="Excluir despesa"
                      >
                        {deletingId === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/10 bg-[#0d1320] px-3 py-2.5">
          <p className="text-xs text-zinc-400">
            Total do período:{' '}
            <span className="font-semibold text-red-400 tabular-nums">
              {formatCurrency(total)}
            </span>
          </p>
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
