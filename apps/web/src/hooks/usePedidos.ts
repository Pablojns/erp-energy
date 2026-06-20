'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { normalizePedidoFromApi } from '@/src/services/api/pedidos-normalize';

export type UsePedidosOptions = {
  statusFilter?: StatusFilterId;
  search?: string;
  appliedFilters?: FilterFormState;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
  mode?: 'expedition' | 'separation';
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
  } = opts;

  const [pedidos, setPedidos] = useState<OrderDto[]>([]);
  const [meta, setMeta] = useState<PaginatedOrders['meta'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const searchDebounced = search.trim();
      const params = buildFilterParams({
        appliedFilters,
        searchDebounced,
        statusFilter,
        mode,
      });
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));

      const res = await erpFetchJson<PaginatedOrders>(
        `api/pedidos?${params.toString()}`,
      );
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
      setPedidos(refined);
    } catch (e) {
      setPedidos([]);
      setMeta(null);
      setError(e instanceof Error ? e.message : 'Falha ao carregar pedidos.');
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    search,
    statusFilter,
    appliedFilters,
    page,
    pageSize,
    mode,
  ]);

  useEffect(() => {
    void fetchPedidos();
  }, [fetchPedidos]);

  return {
    pedidos,
    loading,
    error,
    meta,
    refetch: fetchPedidos,
  };
}
