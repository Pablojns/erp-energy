'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaginatedOrderExits } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { OutputDetailPanel } from '@/src/components/expedicao/outputs/output-detail-panel';
import {
  OutputsList,
  type ExitPeriod,
} from '@/src/components/expedicao/outputs/outputs-list';

export function ExitsPage() {
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [period, setPeriod] = useState<ExitPeriod>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<PaginatedOrderExits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [searchDebounced, period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void erpFetchJson<PaginatedOrderExits>(
      `api/pedidos/saidas?search=${encodeURIComponent(searchDebounced)}&period=${period}&page=${page}&pageSize=25`,
    )
      .then((res) => {
        if (cancelled) return;
        setPayload(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setPayload(null);
        setError(e instanceof Error ? e.message : 'Falha ao carregar saídas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchDebounced, period, page]);

  useEffect(() => {
    if (!payload?.data?.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId && payload.data.some((x) => x.id === selectedId)) return;
    setSelectedId(payload.data[0].id);
  }, [payload, selectedId]);

  const selected = useMemo(
    () => payload?.data.find((x) => x.id === selectedId) ?? null,
    [payload, selectedId],
  );

  const handleObsExpedicaoSaved = useCallback((value: string | null) => {
    setPayload((prev) => {
      if (!prev || !selectedId) return prev;
      return {
        ...prev,
        data: prev.data.map((row) =>
          row.id === selectedId
            ? {
                ...row,
                order: { ...row.order, obsExpedicao: value },
              }
            : row,
        ),
      };
    });
  }, [selectedId]);

  return (
    <div className="flex h-full w-full flex-col gap-4 px-4 pt-4">
      <div className="grid h-full w-full grid-cols-1 gap-4 lg:grid-cols-[40fr_60fr]">
        <OutputsList
          search={search}
          onSearchChange={setSearch}
          period={period}
          onPeriodChange={setPeriod}
          loading={loading}
          error={error}
          payload={payload}
          selectedId={selectedId}
          onSelect={setSelectedId}
          page={page}
          onPageChange={setPage}
        />

        <section className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          {!selected ? (
            <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-[var(--text-secondary)]">
              Selecione uma saída para visualizar os detalhes.
            </div>
          ) : (
            <OutputDetailPanel
              exit={selected}
              onObsExpedicaoSaved={handleObsExpedicaoSaved}
            />
          )}
        </section>
      </div>
    </div>
  );
}
