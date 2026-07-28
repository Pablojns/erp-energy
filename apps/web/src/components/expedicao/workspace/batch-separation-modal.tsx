'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Printer,
  X,
} from 'lucide-react';
import {
  formatOrderQueueDate,
  getOverdueDays,
} from '@/src/components/expedicao/shared/order-helpers';
import type {
  OrderDto,
  OrderSource,
  OrderStatus,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { downloadColetaListaPdf } from '@/src/utils/download-coleta-lista-pdf';

export type SeparacaoLoteOrderRow = {
  id: string;
  displayNumber: string;
  qty: number;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  status: OrderStatus;
};

export type SeparacaoLoteProductRow = {
  sku: string;
  productName: string;
  totalQty: number;
  orderCount: number;
  stockAvailable: number | null;
  orders: SeparacaoLoteOrderRow[];
};

type SeparacaoLoteResumoResponse = {
  products: SeparacaoLoteProductRow[];
};

type SentBatchSnapshot = {
  orderIds: string[];
  items: Array<{ productName: string; totalQty: number }>;
};

function productKey(p: SeparacaoLoteProductRow) {
  return `${p.sku}::${p.productName}`;
}

function orderDateTs(iso: string | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function sortOrdersOldestFirst(
  orders: SeparacaoLoteOrderRow[],
): SeparacaoLoteOrderRow[] {
  return [...orders].sort((a, b) => {
    const da = orderDateTs(a.orderDate);
    const db = orderDateTs(b.orderDate);
    if (da !== db) return da - db;
    return a.displayNumber.localeCompare(b.displayNumber, 'pt-BR');
  });
}

function selectedQtyForOrders(
  orders: SeparacaoLoteOrderRow[],
  selectedIds: Set<string>,
): number {
  let qty = 0;
  for (const order of orders) {
    if (selectedIds.has(order.id)) qty += order.qty;
  }
  return qty;
}

function isLoteOrderOverdue(order: SeparacaoLoteOrderRow): boolean {
  return (
    getOverdueDays({
      status: order.status,
      requestedDeliveryDate: order.requestedDeliveryDate,
    } as OrderDto) !== null
  );
}

export function BatchSeparationModal(props: {
  source?: OrderSource | 'all';
  businessContext?: 'WEG' | 'SITE' | 'ALL';
  onClose: () => void;
  onSent?: () => void;
}) {
  const { source, businessContext, onClose, onSent } = props;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SeparacaoLoteProductRow[]>([]);
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sentBatch, setSentBatch] = useState<SentBatchSnapshot | null>(null);

  const loadResumo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (source && source !== 'all') params.set('source', source);
      if (businessContext === 'WEG' || businessContext === 'SITE') {
        params.set('businessContext', businessContext);
      }
      const qs = params.toString();
      const res = await erpFetchJson<SeparacaoLoteResumoResponse>(
        `api/pedidos/separacao-lote-resumo${qs ? `?${qs}` : ''}`,
      );
      setProducts(Array.isArray(res.products) ? res.products : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao carregar resumo por produto.',
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [source, businessContext]);

  useEffect(() => {
    void loadResumo();
  }, [loadResumo]);

  const productsWithSortedOrders = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        orders: sortOrdersOldestFirst(product.orders),
      })),
    [products],
  );

  const selectedCount = selectedIds.size;

  const toggleExpand = (key: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleOrder = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAllInProduct = (orders: SeparacaoLoteOrderRow[]) => {
    const ids = orders.map((o) => o.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  };

  const buildColetaItems = useMemo(() => {
    if (selectedIds.size === 0) {
      return [] as Array<{ productName: string; totalQty: number }>;
    }
    const totals = new Map<string, { productName: string; totalQty: number }>();
    for (const product of productsWithSortedOrders) {
      const qty = selectedQtyForOrders(product.orders, selectedIds);
      if (qty <= 0) continue;
      const existing = totals.get(productKey(product));
      if (existing) existing.totalQty += qty;
      else {
        totals.set(productKey(product), {
          productName: product.productName,
          totalQty: qty,
        });
      }
    }
    return [...totals.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName, 'pt-BR', {
        sensitivity: 'base',
      }),
    );
  }, [productsWithSortedOrders, selectedIds]);

  const handleSend = async () => {
    if (selectedIds.size === 0 || sending) return;
    setSending(true);
    setError(null);

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const product of productsWithSortedOrders) {
      for (const order of product.orders) {
        if (!selectedIds.has(order.id) || seen.has(order.id)) continue;
        seen.add(order.id);
        orderedIds.push(order.id);
      }
    }

    const coletaItems = buildColetaItems;
    const errors: string[] = [];

    for (const id of orderedIds) {
      try {
        await erpFetchJson(`orders/${id}/send-to-picking`, { method: 'POST' });
      } catch (err) {
        errors.push(
          err instanceof Error ? err.message : `Falha ao enviar pedido ${id}.`,
        );
      }
    }

    setSending(false);

    if (orderedIds.length - errors.length > 0) {
      setSentBatch({
        orderIds: orderedIds,
        items: coletaItems,
      });
      setSelectedIds(new Set());
      onSent?.();
      void loadResumo();
    }

    if (errors.length > 0) {
      setError(
        `${orderedIds.length - errors.length} enviado(s). Falhas: ${errors.slice(0, 3).join(' | ')}${
          errors.length > 3 ? '…' : ''
        }`,
      );
    }
  };

  const handlePrint = () => {
    const snapshot = sentBatch;
    if (!snapshot || snapshot.items.length === 0) return;
    downloadColetaListaPdf({
      items: snapshot.items,
      orderCount: snapshot.orderIds.length,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Separação em Lote por Item
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Demanda agregada dos pedidos NOVO ainda não enviados à separação
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando resumo…
            </div>
          ) : error && products.length === 0 ? (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[var(--text-secondary)]">
              <Package className="h-8 w-8 opacity-50" />
              Nenhum pedido NOVO pendente de separação.
            </div>
          ) : (
            <ul className="space-y-2">
              {productsWithSortedOrders.map((product) => {
                const key = productKey(product);
                const expanded = expandedSkus.has(key);
                const productOrderIds = product.orders.map((o) => o.id);
                const selectedInProduct = productOrderIds.filter((id) =>
                  selectedIds.has(id),
                ).length;
                const allSelected =
                  productOrderIds.length > 0 &&
                  selectedInProduct === productOrderIds.length;
                const markedQty = selectedQtyForOrders(
                  product.orders,
                  selectedIds,
                );
                const stock = product.stockAvailable;
                const stockAfterSelection =
                  stock !== null ? stock - markedQty : null;
                const insufficient =
                  stockAfterSelection !== null && stockAfterSelection < 0;
                const withinLimit =
                  stockAfterSelection !== null &&
                  markedQty > 0 &&
                  stockAfterSelection >= 0;
                const skuLabel =
                  product.sku && product.sku !== '(sem SKU)'
                    ? ` — SKU ${product.sku}`
                    : '';

                return (
                  <li
                    key={key}
                    className="overflow-x-auto rounded-lg border border-[var(--border-color)]"
                  >
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        onClick={() => toggleExpand(key)}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Recolher' : 'Expandir'}
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => toggleExpand(key)}
                      >
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {product.productName}
                          {skuLabel}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                          {product.orderCount} pedido
                          {product.orderCount === 1 ? '' : 's'}
                        </span>
                      </button>
                      <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                selectedInProduct > 0 && !allSelected;
                            }
                          }}
                          onChange={() => toggleAllInProduct(product.orders)}
                          aria-label={`Selecionar todos os pedidos de ${product.productName}`}
                        />
                        Todos
                      </label>
                    </div>

                    {expanded ? (
                      <div className="border-t border-[var(--border-color)] bg-[var(--bg-muted)]/30 px-3 py-2">
                        <ul className="space-y-0.5">
                          {product.orders.map((order) => {
                            const overdue = isLoteOrderOverdue(order);
                            const dateLabel = formatOrderQueueDate(
                              order.orderDate,
                            );

                            return (
                              <li key={`${key}-${order.id}`}>
                                <label
                                  className={`flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm ${
                                    overdue
                                      ? 'text-red-600'
                                      : 'text-[var(--text-primary)]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="shrink-0"
                                    checked={selectedIds.has(order.id)}
                                    onChange={() => toggleOrder(order.id)}
                                  />
                                  <span className="tabular-nums">
                                    Pedido #{order.displayNumber} — {order.qty}{' '}
                                    un — Estoque:{' '}
                                    {stock !== null ? stock : '—'} — {dateLabel}
                                    {overdue ? ' (atrasado)' : ''}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>

                        <div
                          className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${
                            insufficient
                              ? 'border-red-400/80 bg-red-500/5'
                              : withinLimit
                                ? 'border-emerald-500/60 bg-emerald-500/5'
                                : 'border-[var(--border-color)] bg-[var(--bg-card)]'
                          }`}
                        >
                          <div
                            className={`flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap ${
                              insufficient
                                ? 'text-red-600'
                                : withinLimit
                                  ? 'text-emerald-700'
                                  : 'text-[var(--text-primary)]'
                            }`}
                          >
                            <span>Total: {product.totalQty} un</span>
                            <span aria-hidden>|</span>
                            <span>Selecionado: {markedQty} un</span>
                            <span aria-hidden>|</span>
                            <span>
                              Em estoque:{' '}
                              {stockAfterSelection !== null
                                ? `${stockAfterSelection} un`
                                : '—'}
                            </span>
                            {stockAfterSelection !== null && markedQty > 0 ? (
                              insufficient ? (
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="h-4 w-4 shrink-0" />
                                  Estoque insuficiente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  Dentro do limite
                                </span>
                              )
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {error && products.length > 0 ? (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          ) : null}

          {sentBatch ? (
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              {sentBatch.orderIds.length} pedido
              {sentBatch.orderIds.length === 1 ? '' : 's'} enviado
              {sentBatch.orderIds.length === 1 ? '' : 's'} para separação.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <span className="text-sm text-[var(--text-secondary)]">
            {selectedCount} pedido{selectedCount === 1 ? '' : 's'} selecionado
            {selectedCount === 1 ? '' : 's'}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
              onClick={onClose}
              disabled={sending}
            >
              Fechar
            </button>
            {sentBatch ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] hover:border-[#2AACE2] hover:text-[#2AACE2]"
                onClick={handlePrint}
              >
                <Printer className="h-4 w-4" />
                Imprimir Lista de Coleta
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
              onClick={() => void handleSend()}
              disabled={sending || selectedCount === 0}
            >
              {sending
                ? 'Enviando…'
                : 'Enviar Selecionados para Separação'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
