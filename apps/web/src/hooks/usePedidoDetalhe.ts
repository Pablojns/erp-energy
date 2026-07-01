'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi, normalizeItemFromApi, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

export function usePedidoDetalhe(numeroPed: string | null | undefined) {
  const [pedido, setPedido] = useState<OrderDto | null>(null);
  const [itens, setItens] = useState<OrderItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetalhe = useCallback(async () => {
    const raw = numeroPed?.trim();
    if (!raw) {
      setPedido(null);
      setItens([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [orderRes, itensRes] = await Promise.all([
        erpFetchJson<Record<string, unknown>>(pedidoApiUrl(raw)),
        erpFetchJson<Record<string, unknown>[]>(pedidoApiUrl(raw, 'itens')).catch(
          () => null,
        ),
      ]);

      const normalized = normalizePedidoFromApi(orderRes);
      if (itensRes && Array.isArray(itensRes) && itensRes.length > 0) {
        normalized.items = itensRes.map((it) =>
          normalizeItemFromApi(it as Record<string, unknown>),
        );
      }
      setPedido(normalized);
      setItens(normalized.items);
    } catch (e) {
      setPedido(null);
      setItens([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar pedido.');
    } finally {
      setLoading(false);
    }
  }, [numeroPed]);

  useEffect(() => {
    void fetchDetalhe();
  }, [fetchDetalhe]);

  return {
    pedido,
    itens,
    loading,
    error,
    refetch: fetchDetalhe,
  };
}
