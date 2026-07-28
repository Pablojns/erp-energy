'use client';

import { useEffect, useState } from 'react';
import { resolveInitialItemAvailable } from '@/src/components/expedicao/shared/item-stock-availability';
import type { OrderItemDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type OrderItemStockState = {
  available: number | null;
  loading: boolean;
};

type ProductStockRow = {
  id: string;
  sku: string;
  availableQty?: number;
  stockQty?: number;
  reservedQty?: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function productAvailable(p: ProductStockRow): number {
  if (p.availableQty !== undefined && p.availableQty !== null) {
    return p.availableQty;
  }
  return (p.stockQty ?? 0) - (p.reservedQty ?? 0);
}

function resolveAvailableForItem(
  item: OrderItemDto,
  byId: Map<string, ProductStockRow>,
  bySku: Map<string, ProductStockRow>,
): number | null {
  const productId = item.productId ?? item.product?.id ?? null;
  if (productId) {
    const hit = byId.get(productId);
    if (hit) return productAvailable(hit);
  }
  const sku = item.sku?.trim().toLowerCase();
  if (sku) {
    const hit = bySku.get(sku);
    if (hit) return productAvailable(hit);
  }
  return resolveInitialItemAvailable(item);
}

function buildInitialState(
  items: OrderItemDto[],
): Record<string, OrderItemStockState> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { available: resolveInitialItemAvailable(item), loading: true },
    ]),
  );
}

export function useOrderItemsStock(items: OrderItemDto[]): Record<string, OrderItemStockState> {
  const itemKey = items
    .map((item) => `${item.id}:${item.productId ?? ''}:${item.sku}:${item.quantity}`)
    .join('|');

  const [stockByItemId, setStockByItemId] = useState<Record<string, OrderItemStockState>>(
    () => buildInitialState(items),
  );

  useEffect(() => {
    let cancelled = false;

    setStockByItemId(buildInitialState(items));

    if (items.length === 0) {
      setStockByItemId({});
      return;
    }

    void (async () => {
      // Sempre envia ids E skus: se o productId estiver stale/inativo, o SKU ainda resolve.
      const ids = [
        ...new Set(
          items
            .map((it) => it.productId ?? it.product?.id ?? null)
            .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)),
        ),
      ];
      const skus = [
        ...new Set(
          items
            .map((it) => it.sku?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      ];

      const applyRows = (rows: ProductStockRow[]) => {
        if (cancelled) return;
        const byId = new Map(rows.map((p) => [p.id, p]));
        const bySku = new Map(
          rows.map((p) => [p.sku.trim().toLowerCase(), p]),
        );
        setStockByItemId(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              {
                available: resolveAvailableForItem(item, byId, bySku),
                loading: false,
              },
            ]),
          ),
        );
      };

      if (ids.length === 0 && skus.length === 0) {
        if (cancelled) return;
        setStockByItemId(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              {
                available: resolveInitialItemAvailable(item),
                loading: false,
              },
            ]),
          ),
        );
        return;
      }

      try {
        const res = await erpFetchJson<{ data: ProductStockRow[] }>(
          'products/stock-batch',
          {
            method: 'POST',
            body: JSON.stringify({ ids, skus }),
          },
        );
        applyRows(res.data ?? []);
      } catch {
        if (cancelled) return;
        // Fallback: tenta só por SKU (evita 400 por id inválido no servidor antigo).
        if (skus.length > 0 && ids.length > 0) {
          try {
            const res = await erpFetchJson<{ data: ProductStockRow[] }>(
              'products/stock-batch',
              {
                method: 'POST',
                body: JSON.stringify({ ids: [], skus }),
              },
            );
            applyRows(res.data ?? []);
            return;
          } catch {
            // cai no fallback local
          }
        }
        if (cancelled) return;
        setStockByItemId(
          Object.fromEntries(
            items.map((item) => [
              item.id,
              {
                available: resolveInitialItemAvailable(item),
                loading: false,
              },
            ]),
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // items é derivado de itemKey; incluir itemKey evita refetch espúrio.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemKey cobre mudanças relevantes
  }, [itemKey]);

  return stockByItemId;
}
