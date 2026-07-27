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

export function useOrderItemsStock(items: OrderItemDto[]): Record<string, OrderItemStockState> {
  const itemKey = items
    .map((item) => `${item.id}:${item.productId ?? ''}:${item.sku}:${item.quantity}`)
    .join('|');

  const [stockByItemId, setStockByItemId] = useState<Record<string, OrderItemStockState>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        { available: resolveInitialItemAvailable(item), loading: true },
      ]),
    ),
  );

  useEffect(() => {
    let cancelled = false;

    setStockByItemId(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          { available: resolveInitialItemAvailable(item), loading: true },
        ]),
      ),
    );

    if (items.length === 0) {
      setStockByItemId({});
      return;
    }

    void (async () => {
      const ids = [
        ...new Set(
          items
            .map((it) => it.productId ?? it.product?.id ?? null)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const skus = [
        ...new Set(
          items
            .filter((it) => !(it.productId ?? it.product?.id))
            .map((it) => it.sku?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      ];

      try {
        const res = await erpFetchJson<{ data: ProductStockRow[] }>(
          'products/stock-batch',
          {
            method: 'POST',
            body: JSON.stringify({ ids, skus }),
          },
        );

        if (cancelled) return;

        const byId = new Map(res.data.map((p) => [p.id, p]));
        const bySku = new Map(
          res.data.map((p) => [p.sku.trim().toLowerCase(), p]),
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
      } catch {
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
  }, [itemKey]);

  return stockByItemId;
}
