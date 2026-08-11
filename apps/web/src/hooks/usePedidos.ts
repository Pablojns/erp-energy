'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFilterParams,
  clientRefineOrders,
} from '@/src/components/expedicao/shared/filter-params';
import { INITIAL_FILTERS } from '@/src/components/expedicao/shared/constants';
import { isOrderOverdue } from '@/src/components/expedicao/shared/order-helpers';
import type {
  FilterFormState,
  OrderDto,
  PaginatedOrders,
  StatusFilterId,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';

export type UsePedidosOptions = {
  statusFilter?: StatusFilterId;
  search?: string;
  appliedFilters?: FilterFormState;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
  mode?: 'expedition' | 'separation';
  /** Acumula páginas para scroll infinito (substitui na página 1). */
  infinite?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  businessContext?: 'WEG' | 'SITE' | 'ALL';
  /**
   * Chamado quando a lista volta à página 1 (filtro, refetch, focus).
   * O bridge deve zerar `page` para não dessincronizar o scroll infinito.
   */
  onPageReset?: () => void;
};

export function usePedidos(opts: UsePedidosOptions = {}) {
  const {
    statusFilter = 'all',
    search = '',
    appliedFilters = INITIAL_FILTERS,
    page = 1,
    pageSize = 25,
    enabled = true,
    mode = 'expedition',
    infinite = false,
    sortBy = 'orderDate',
    sortOrder = 'desc',
    businessContext,
    onPageReset,
  } = opts;

  const [pedidos, setPedidos] = useState<OrderDto[]>([]);
  const [meta, setMeta] = useState<PaginatedOrders['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGenerationRef = useRef(0);
  // Contador de requisições em voo: garante que o loading sempre seja liberado
  // (antes, se a requisição mais recente fosse invalidada, o skeleton ficava eterno).
  const inFlightRef = useRef(0);
  const onPageResetRef = useRef(onPageReset);
  onPageResetRef.current = onPageReset;

  const listQueryKey = useMemo(
    () =>
      JSON.stringify({
        search,
        statusFilter,
        appliedFilters,
        pageSize,
        mode,
        sortBy,
        sortOrder,
        businessContext,
      }),
    [
      search,
      statusFilter,
      appliedFilters,
      pageSize,
      mode,
      sortBy,
      sortOrder,
      businessContext,
    ],
  );
  const listQueryKeyRef = useRef(listQueryKey);

  const runFetch = useCallback(
    async (fetchOpts?: {
      page?: number;
      signal?: AbortSignal;
      /** Força substituir a lista (ex.: refetch na página 1). */
      replace?: boolean;
    }) => {
      if (!enabled) return;

      const generation = ++fetchGenerationRef.current;
      const queryChanged = listQueryKeyRef.current !== listQueryKey;
      listQueryKeyRef.current = listQueryKey;

      // Filtro/refetch/focus: sempre página 1 e avisa o bridge para zerar `page`.
      // Evita lista encolher para a 1ª página enquanto o estado local fica em N>1
      // (próximo loadMore pula páginas e pedidos “somem”).
      const shouldReset =
        queryChanged ||
        fetchOpts?.replace === true ||
        fetchOpts?.page === 1;

      if (shouldReset) {
        onPageResetRef.current?.();
      }

      const effectivePage = shouldReset ? 1 : (fetchOpts?.page ?? page);

      const appendPage =
        infinite && effectivePage > 1 && !shouldReset;

      if (appendPage) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      inFlightRef.current += 1;

      try {
        const searchDebounced = search.trim();
        const params = buildFilterParams({
          appliedFilters,
          searchDebounced,
          statusFilter,
          mode,
          sortBy,
          sortOrder,
          businessContext,
        });
        params.set('page', String(effectivePage));
        params.set('pageSize', String(pageSize));

        const res = await erpFetchJson<PaginatedOrders>(
          `api/pedidos?${params.toString()}`,
          { ...pedidosListFetchInit, signal: fetchOpts?.signal },
        );

        if (generation !== fetchGenerationRef.current) return;

        const list = res.data.map((row) =>
          normalizePedidoFromApi(row as unknown as Record<string, unknown>),
        );
        setMeta(res.meta);

        const refined = clientRefineOrders(
          list,
          statusFilter,
          undefined,
          isOrderOverdue,
        );

        if (appendPage) {
          setPedidos((prev) => {
            const seen = new Set(prev.map((o) => o.id));
            const merged = [...prev];
            for (const order of refined) {
              if (!seen.has(order.id)) merged.push(order);
            }
            return merged;
          });
        } else {
          setPedidos(refined);
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        if (generation !== fetchGenerationRef.current) return;

        if (!appendPage) {
          setPedidos([]);
          setMeta(null);
        }
        setError(e instanceof Error ? e.message : 'Falha ao carregar pedidos.');
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        // Nada em voo: libera o loading independente de geração obsoleta.
        if (inFlightRef.current === 0) {
          setLoadingMore(false);
          setLoading(false);
        } else if (generation === fetchGenerationRef.current) {
          if (appendPage) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [
      enabled,
      listQueryKey,
      page,
      infinite,
      search,
      appliedFilters,
      statusFilter,
      mode,
      sortBy,
      sortOrder,
      businessContext,
      pageSize,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void runFetch({ signal: controller.signal });
    return () => {
      controller.abort();
      fetchGenerationRef.current += 1;
    };
  }, [runFetch]);

  useEffect(() => {
    if (!enabled) return;

    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const revalidate = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        void runFetch({ page: 1, replace: true });
      }, 400);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, runFetch]);

  const refetch = useCallback(async () => {
    await runFetch({ page: 1, replace: true });
  }, [runFetch]);

  const hasMore =
    infinite && meta != null ? meta.page < meta.totalPages : false;

  return {
    pedidos,
    loading,
    loadingMore,
    hasMore,
    error,
    meta,
    refetch,
  };
}
