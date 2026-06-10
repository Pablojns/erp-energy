'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OrderDto, OrderItemDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { normalizePedidoFromApi } from '@/src/services/api/pedidos-normalize';

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
        erpFetchJson<Record<string, unknown>>(`api/pedidos/${raw}`),
        erpFetchJson<Record<string, unknown>[]>(`api/pedidos/${raw}/itens`).catch(
          () => null,
        ),
      ]);

      const normalized = normalizePedidoFromApi(orderRes);
      if (itensRes && Array.isArray(itensRes) && itensRes.length > 0) {
        const mapped = itensRes.map((it) => ({
          id: String(it.id),
          lineNumber: Number(it.lineNumber ?? 0),
          sku: String(it.sku ?? ''),
          description: String(it.description ?? ''),
          quantity: Number(it.quantity ?? 0),
          reservedQuantity: Number(it.reservedQuantity ?? 0),
          missingQty: Number(it.missingQty ?? 0),
          pickedQty: Number(it.pickedQty ?? 0),
          invoicedQty: Number(it.invoicedQty ?? 0),
          availableAtAnalysis:
            it.availableAtAnalysis !== undefined && it.availableAtAnalysis !== null
              ? Number(it.availableAtAnalysis)
              : null,
          stockStatus: it.stockStatus ? String(it.stockStatus) : undefined,
          unit: it.unit ? String(it.unit) : null,
          ncm: it.ncm ? String(it.ncm) : null,
          unitPrice: String(it.unitPrice ?? '0'),
          totalPrice: String(it.totalPrice ?? '0'),
          productId: it.productId ? String(it.productId) : null,
          stockAvailable: null,
          openNeed: 0,
          stockCoversOpenNeed: false,
          product: null,
        })) as OrderItemDto[];
        normalized.items = mapped;
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
