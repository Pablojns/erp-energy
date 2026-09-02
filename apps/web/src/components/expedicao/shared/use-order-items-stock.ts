'use client';

import { useEffect, useRef, useState } from 'react';
import {
  availableFromPhysical,
  resolveInitialItemStockFigures,
} from '@/src/components/expedicao/shared/item-stock-availability';
import type { OrderItemDto } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type OrderItemStockState = {
  onHand: number | null;
  reserved: number | null;
  available: number | null;
  loading: boolean;
};

export const EMPTY_ITEM_STOCK: OrderItemStockState = {
  onHand: null,
  reserved: null,
  available: null,
  loading: true,
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

/** Limite do DTO `ProductStockBatchDto` (@ArrayMaxSize(200)). */
const STOCK_BATCH_MAX = 200;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchProductStockRows(
  ids: string[],
  skus: string[],
): Promise<ProductStockRow[]> {
  const idChunks = chunkArray(ids, STOCK_BATCH_MAX);
  const skuChunks = chunkArray(skus, STOCK_BATCH_MAX);
  const rounds = Math.max(idChunks.length, skuChunks.length, 0);
  if (rounds === 0) return [];

  const rows: ProductStockRow[] = [];
  for (let i = 0; i < rounds; i++) {
    const chunkIds = idChunks[i] ?? [];
    const chunkSkus = skuChunks[i] ?? [];
    if (chunkIds.length === 0 && chunkSkus.length === 0) continue;
    const res = await erpFetchJson<{ data: ProductStockRow[] }>(
      'products/stock-batch',
      {
        method: 'POST',
        body: JSON.stringify({ ids: chunkIds, skus: chunkSkus }),
      },
    );
    rows.push(...(res.data ?? []));
  }
  return rows;
}

function productFigures(
  p: ProductStockRow,
): Pick<OrderItemStockState, 'onHand' | 'reserved' | 'available'> {
  const onHand = typeof p.stockQty === 'number' ? p.stockQty : null;
  const reserved = typeof p.reservedQty === 'number' ? p.reservedQty : 0;
  return {
    onHand,
    reserved,
    available: availableFromPhysical(onHand, reserved),
  };
}

function resolveFiguresForItem(
  item: OrderItemDto,
  byId: Map<string, ProductStockRow>,
  bySku: Map<string, ProductStockRow>,
): Pick<OrderItemStockState, 'onHand' | 'reserved' | 'available'> {
  const productId = item.productId ?? item.product?.id ?? null;
  if (productId) {
    const hit = byId.get(productId);
    if (hit) return productFigures(hit);
  }
  const sku = item.sku?.trim().toLowerCase();
  if (sku) {
    const hit = bySku.get(sku);
    if (hit) return productFigures(hit);
  }
  return resolveInitialItemStockFigures(item);
}

function buildInitialState(
  items: OrderItemDto[],
): Record<string, OrderItemStockState> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      { ...resolveInitialItemStockFigures(item), loading: true },
    ]),
  );
}

export function useOrderItemsStock(items: OrderItemDto[]): Record<string, OrderItemStockState> {
  const itemKey = items
    .map((item) => `${item.id}:${item.productId ?? ''}:${item.sku}:${item.quantity}`)
    .join('|');

  const resolvedRef = useRef<Record<string, { sig: string; stock: OrderItemStockState }>>(
    {},
  );

  const [stockByItemId, setStockByItemId] = useState<Record<string, OrderItemStockState>>(
    () => buildInitialState(items),
  );

  useEffect(() => {
    let cancelled = false;

    if (items.length === 0) {
      resolvedRef.current = {};
      setStockByItemId({});
      return;
    }

    const currentIds = new Set(items.map((item) => item.id));
    for (const id of Object.keys(resolvedRef.current)) {
      if (!currentIds.has(id)) delete resolvedRef.current[id];
    }

    const unresolved: OrderItemDto[] = [];
    const nextState: Record<string, OrderItemStockState> = {};
    for (const item of items) {
      const sig = `${item.id}:${item.productId ?? ''}:${item.sku}:${item.quantity}`;
      const cached = resolvedRef.current[item.id];
      if (cached && cached.sig === sig && !cached.stock.loading) {
        nextState[item.id] = cached.stock;
      } else {
        unresolved.push(item);
        nextState[item.id] = { ...resolveInitialItemStockFigures(item), loading: true };
      }
    }
    setStockByItemId(nextState);

    if (unresolved.length === 0) return;

    void (async () => {
      const ids = [
        ...new Set(
          unresolved
            .map((it) => it.productId ?? it.product?.id ?? null)
            .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)),
        ),
      ];
      const skus = [
        ...new Set(
          unresolved
            .map((it) => it.sku?.trim())
            .filter((s): s is string => Boolean(s)),
        ),
      ];

      const commit = (resolve: (item: OrderItemDto) => OrderItemStockState) => {
        if (cancelled) return;
        setStockByItemId((prev) => {
          const merged = { ...prev };
          for (const item of unresolved) {
            const stock = resolve(item);
            merged[item.id] = stock;
            resolvedRef.current[item.id] = {
              sig: `${item.id}:${item.productId ?? ''}:${item.sku}:${item.quantity}`,
              stock,
            };
          }
          return merged;
        });
      };

      if (ids.length === 0 && skus.length === 0) {
        commit((item) => ({
          ...resolveInitialItemStockFigures(item),
          loading: false,
        }));
        return;
      }

      try {
        const rows = await fetchProductStockRows(ids, skus);
        const byId = new Map(rows.map((p) => [p.id, p]));
        const bySku = new Map(rows.map((p) => [p.sku.trim().toLowerCase(), p]));
        commit((item) => ({
          ...resolveFiguresForItem(item, byId, bySku),
          loading: false,
        }));
      } catch {
        if (cancelled) return;
        if (skus.length > 0 && ids.length > 0) {
          try {
            const rows = await fetchProductStockRows([], skus);
            const byId = new Map(rows.map((p) => [p.id, p]));
            const bySku = new Map(rows.map((p) => [p.sku.trim().toLowerCase(), p]));
            commit((item) => ({
              ...resolveFiguresForItem(item, byId, bySku),
              loading: false,
            }));
            return;
          } catch {
            // cai no fallback local
          }
        }
        commit((item) => ({
          ...resolveInitialItemStockFigures(item),
          loading: false,
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemKey cobre mudanças relevantes
  }, [itemKey]);

  return stockByItemId;
}
