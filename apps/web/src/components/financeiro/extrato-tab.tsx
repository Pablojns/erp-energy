'use client';

import { ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FinanceiroPeriodSelector } from '@/src/components/financeiro/period-selector';
import type { ExtratoResponse, PeriodPreset } from '@/src/components/financeiro/types';
import {
  formatCurrency,
  formatDateBr,
  formatYmd,
  resolvePeriodRange,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export function FinanceiroExtratoTab() {
  const today = formatYmd(new Date());
  const defaultRange = resolvePeriodRange('mes');

  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [customInicio, setCustomInicio] = useState(defaultRange.dataInicio);
  const [customFim, setCustomFim] = useState(defaultRange.dataFim);
  const [data, setData] = useState<ExtratoResponse | null>(null);
  const [loading, setLoading] = useState(true);
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
      const res = await erpFetchJson<ExtratoResponse>(
        `api/financeiro/extrato?${qs.toString()}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar extrato.');
    } finally {
      setLoading(false);
    }
  }, [range.dataInicio, range.dataFim]);

  useEffect(() => {
    if (preset === 'personalizado' && (!customInicio || !customFim)) return;
    void load();
  }, [load, preset, customInicio, customFim]);

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <FinanceiroPeriodSelector
        preset={preset}
        customInicio={customInicio}
        customFim={customFim}
        onPresetChange={setPreset}
        onCustomInicioChange={setCustomInicio}
        onCustomFimChange={setCustomFim}
      />

      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-white/10">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-zinc-500">
            Nenhum lançamento no período.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {items.map((item) => {
              const isEntrada = item.tipo === 'ENTRADA';
              return (
                <li
                  key={`${item.tipo}-${item.id}`}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between hover:bg-white/[0.02]"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        isEntrada
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}
                    >
                      {isEntrada ? (
                        <ArrowDownLeft className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-200">
                        {item.descricao}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatDateBr(item.data)}
                        {item.referencia ? ` · ${item.referencia}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        isEntrada ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {isEntrada ? 'Entrada' : 'Saída'}
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isEntrada ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {isEntrada ? '+' : '-'}
                      {formatCurrency(item.valor)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data ? (
          <div className="grid grid-cols-1 gap-2 border-t border-white/10 bg-[#0d1320] px-4 py-3 sm:grid-cols-3">
            <p className="text-xs text-zinc-400">
              Entradas:{' '}
              <span className="font-semibold text-emerald-400 tabular-nums">
                {formatCurrency(data.totalEntradas)}
              </span>
            </p>
            <p className="text-xs text-zinc-400">
              Saídas:{' '}
              <span className="font-semibold text-red-400 tabular-nums">
                {formatCurrency(data.totalSaidas)}
              </span>
            </p>
            <p className="text-xs text-zinc-400">
              Saldo:{' '}
              <span
                className={`font-semibold tabular-nums ${
                  data.saldo >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatCurrency(data.saldo)}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
