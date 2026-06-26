'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FinanceiroMetricCard,
  FinanceiroMetricCardSkeleton,
} from '@/src/components/financeiro/metric-card';
import { FinanceiroPeriodSelector } from '@/src/components/financeiro/period-selector';
import type { FinanceiroDashboard, PeriodPreset } from '@/src/components/financeiro/types';
import {
  formatCurrency,
  formatYmd,
  resolvePeriodRange,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export function FinanceiroDashboardTab() {
  const today = formatYmd(new Date());
  const defaultRange = resolvePeriodRange('mes');

  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [customInicio, setCustomInicio] = useState(defaultRange.dataInicio);
  const [customFim, setCustomFim] = useState(defaultRange.dataFim);
  const [data, setData] = useState<FinanceiroDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await erpFetchJson<FinanceiroDashboard>(
        `api/financeiro/dashboard?${qs.toString()}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [range.dataInicio, range.dataFim]);

  useEffect(() => {
    if (preset === 'personalizado' && (!customInicio || !customFim)) return;
    void load();
  }, [load, preset, customInicio, customFim]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await erpFetchJson('api/financeiro/sync', { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao sincronizar NFs.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          onClick={() => void handleSync()}
          disabled={syncing}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#0d1320] px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-blue-500/40 hover:text-white disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Sincronizar NFs
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <FinanceiroMetricCardSkeleton key={i} />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <FinanceiroMetricCard
            label="Faturamento do período"
            value={formatCurrency(data.faturamentoMes)}
          />
          <FinanceiroMetricCard
            label="Total em aberto"
            value={formatCurrency(data.totalEmAberto)}
            tone="warning"
          />
          <FinanceiroMetricCard
            label="Total atrasado"
            value={formatCurrency(data.totalAtrasado)}
            tone="danger"
          />
          <FinanceiroMetricCard
            label="Total pago"
            value={formatCurrency(data.totalPago)}
            tone="success"
          />
          <FinanceiroMetricCard
            label="Despesas do período"
            value={formatCurrency(data.despesasMes)}
          />
          <FinanceiroMetricCard
            label="Lucro bruto"
            value={formatCurrency(data.lucroBruto)}
            tone={data.lucroBruto >= 0 ? 'success' : 'danger'}
          />
        </div>
      ) : null}
    </div>
  );
}
