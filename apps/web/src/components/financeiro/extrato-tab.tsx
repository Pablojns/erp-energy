'use client';

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FinFilterOptionButton,
  FinFilterOptionGroup,
  FinFiltersDropdown,
} from '@/src/components/financeiro/fin-filters-dropdown';
import { FinTimelineSkeleton } from '@/src/components/financeiro/skeletons';
import type { ExtratoItem, ExtratoResponse, FinanceiroPeriod } from '@/src/components/financeiro/types';
import { buildFinanceiroPeriodQuery, formatCurrency, formatDateBr } from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type TimelineRow = ExtratoItem & { saldoAcumulado: number };

function buildTimeline(items: ExtratoItem[]): TimelineRow[] {
  const asc = [...items].sort(
    (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime(),
  );
  let running = 0;
  const balanceByKey = new Map<string, number>();
  for (const item of asc) {
    running += item.tipo === 'ENTRADA' ? item.valor : -item.valor;
    balanceByKey.set(`${item.tipo}-${item.id}`, running);
  }
  return [...items]
    .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    .map((item) => ({
      ...item,
      saldoAcumulado: balanceByKey.get(`${item.tipo}-${item.id}`) ?? 0,
    }));
}

export function FinanceiroExtratoTab(props: {
  period: FinanceiroPeriod;
  refreshToken: number;
}) {
  const { period, refreshToken } = props;
  const [data, setData] = useState<ExtratoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipoFilter, setTipoFilter] = useState<'ALL' | 'ENTRADA' | 'SAIDA'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await erpFetchJson<ExtratoResponse>(
        `api/financeiro/extrato${buildFinanceiroPeriodQuery(period)}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar extrato.');
    } finally {
      setLoading(false);
    }
  }, [period.dataInicio, period.dataFim]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filteredItems = useMemo(() => {
    const items = data?.items ?? [];
    if (tipoFilter === 'ALL') return items;
    return items.filter((item) => item.tipo === tipoFilter);
  }, [data?.items, tipoFilter]);

  const filteredTotals = useMemo(() => {
    const totalEntradas = filteredItems
      .filter((i) => i.tipo === 'ENTRADA')
      .reduce((acc, i) => acc + i.valor, 0);
    const totalSaidas = filteredItems
      .filter((i) => i.tipo === 'SAIDA')
      .reduce((acc, i) => acc + i.valor, 0);
    return {
      totalEntradas,
      totalSaidas,
      saldo: totalEntradas - totalSaidas,
    };
  }, [filteredItems]);

  const activeFilterCount = tipoFilter !== 'ALL' ? 1 : 0;

  const timeline = useMemo(() => buildTimeline(filteredItems), [filteredItems]);

  if (loading) {
    return <FinTimelineSkeleton />;
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="text-sm text-[var(--fin-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-w-0 max-w-md overflow-visible">
        <FinFiltersDropdown
          activeCount={activeFilterCount}
          title="Filtrar extrato"
          onClear={() => setTipoFilter('ALL')}
        >
        <FinFilterOptionGroup label="Tipo">
          <FinFilterOptionButton
            active={tipoFilter === 'ALL'}
            onClick={() => setTipoFilter('ALL')}
          >
            Todos
          </FinFilterOptionButton>
          <FinFilterOptionButton
            active={tipoFilter === 'ENTRADA'}
            onClick={() => setTipoFilter('ENTRADA')}
          >
            Entradas
          </FinFilterOptionButton>
          <FinFilterOptionButton
            active={tipoFilter === 'SAIDA'}
            onClick={() => setTipoFilter('SAIDA')}
          >
            Saídas
          </FinFilterOptionButton>
        </FinFilterOptionGroup>
        </FinFiltersDropdown>
      </div>

      <div className="fin-card overflow-hidden rounded-2xl">
        <div className="erp-scrollbar max-h-[min(62vh,640px)] overflow-y-auto">
          {timeline.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-[var(--fin-text-muted)]">
              Nenhum lançamento no período.
            </p>
          ) : (
            <ul>
              {timeline.map((item) => {
                const isEntrada = item.tipo === 'ENTRADA';
                return (
                  <li
                    key={`${item.tipo}-${item.id}`}
                    className="grid grid-cols-1 gap-3 border-b px-4 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    style={{ borderColor: 'var(--fin-border)' }}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: isEntrada
                            ? 'var(--fin-success-soft)'
                            : 'var(--fin-danger-soft)',
                          color: isEntrada ? 'var(--fin-success)' : 'var(--fin-danger)',
                        }}
                      >
                        {isEntrada ? (
                          <ArrowDownLeft className="h-4 w-4" aria-hidden />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--fin-text)]">
                          {item.descricao}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--fin-text-muted)]">
                          {formatDateBr(item.data)}
                          {item.referencia ? ` · ${item.referencia}` : ''}
                        </p>
                      </div>
                    </div>

                    <span
                      className="justify-self-start rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:justify-self-center"
                      style={{
                        background: isEntrada
                          ? 'var(--fin-accent-soft)'
                          : 'var(--fin-danger-soft)',
                        color: isEntrada ? 'var(--fin-accent)' : 'var(--fin-danger)',
                      }}
                    >
                      {isEntrada ? 'Receita' : 'Despesa'}
                    </span>

                    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{
                          color: isEntrada ? 'var(--fin-success)' : 'var(--fin-danger)',
                        }}
                      >
                        {isEntrada ? '+' : '−'}
                        {formatCurrency(item.valor)}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--fin-text-secondary)]">
                        Saldo {formatCurrency(item.saldoAcumulado)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {data ? (
          <div
            className="grid grid-cols-1 gap-3 border-t px-4 py-4 sm:grid-cols-3"
            style={{
              borderColor: 'var(--fin-border)',
              background: 'var(--fin-card-muted)',
            }}
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                Entradas no período
              </p>
              <p
                className="mt-1 text-lg font-bold tabular-nums"
                style={{ color: 'var(--fin-success)' }}
              >
                {formatCurrency(filteredTotals.totalEntradas)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                Saídas no período
              </p>
              <p
                className="mt-1 text-lg font-bold tabular-nums"
                style={{ color: 'var(--fin-danger)' }}
              >
                {formatCurrency(filteredTotals.totalSaidas)}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]">
                Saldo acumulado (período)
              </p>
              <p
                className="mt-1 text-xl font-bold tabular-nums"
                style={{
                  color: filteredTotals.saldo >= 0 ? 'var(--fin-success)' : 'var(--fin-danger)',
                }}
              >
                {formatCurrency(filteredTotals.saldo)}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function extratoToCsvRows(data: ExtratoResponse): string[][] {
  return data.items.map((item) => [
    formatDateBr(item.data),
    item.tipo,
    item.descricao,
    item.referencia ?? '',
    String(item.tipo === 'ENTRADA' ? item.valor : -item.valor),
  ]);
}

export const EXTRATO_CSV_HEADERS = [
  'Data',
  'Tipo',
  'Descrição',
  'Referência',
  'Valor',
];
