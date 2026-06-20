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
  sku?: string;
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

async function fetchProductAvailableByItem(item: OrderItemDto): Promise<number | null> {
  const productId = item.productId ?? item.product?.id ?? null;
  if (productId) {
    const p = await erpFetchJson<ProductStockRow>(`products/${productId}`);
    return productAvailable(p);
  }

  const sku = item.sku?.trim();
  if (!sku) return null;

  const res = await erpFetchJson<{ data: ProductStockRow[] }>(
    `products?search=${encodeURIComponent(sku)}&pageSize=50&status=active`,
  );
  const exact = res.data.find((p) => p.sku?.toLowerCase() === sku.toLowerCase());
  if (exact) return productAvailable(exact);
  if (res.data.length === 1) return productAvailable(res.data[0]!);
  return null;
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

    void (async () => {
      const results = await Promise.all(
        items.map(async (item) => {
          try {
            const available = await fetchProductAvailableByItem(item);
            return [item.id, available] as const;
          } catch {
            return [item.id, resolveInitialItemAvailable(item)] as const;
          }
        }),
      );

      if (cancelled) return;

      setStockByItemId(
        Object.fromEntries(
          results.map(([id, available]) => [id, { available, loading: false }]),
        ),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [itemKey]);

  return stockByItemId;
}
