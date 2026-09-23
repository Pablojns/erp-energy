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
  Search,
  X,
} from 'lucide-react';
import {
  formatOrderQueueDate,
  getOverdueDays,
} from '@/src/components/expedicao/shared/order-helpers';
import { getStockAvailabilityTone } from '@/src/components/expedicao/shared/item-stock-availability';
import type {
  OrderDto,
  OrderSource,
  OrderStatus,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { downloadColetaListaPdf } from '@/src/utils/download-coleta-lista-pdf';

export type SeparacaoLoteOrderRow = {
  /** orderId */
  id: string;
  /** orderItemId — chave da seleção granular */
  itemId: string;
  lineNumber: number;
  displayNumber: string;
  qty: number;
  orderDate: string | null;
  requestedDeliveryDate: string | null;
  status: OrderStatus;
  carrierName?: string | null;
};

export type SeparacaoLoteProductRow = {
  sku: string;
  productName: string;
  categoryName?: string | null;
  totalQty: number;
  orderCount: number;
  stockAvailable: number | null;
  orders: SeparacaoLoteOrderRow[];
};

type SeparacaoLoteResumoResponse = {
  products: SeparacaoLoteProductRow[];
};

type SentBatchSnapshot = {
  itemIds: string[];
  orderIds: string[];
  items: Array<{ productName: string; totalQty: number }>;
};

type CoverageFilter = 'all' | 'ok' | 'partial' | 'none';
type UrgencyFilter = 'all' | 'atrasados' | 'antigos';
type GroupBy = 'none' | 'category' | 'carrier';

const OLD_ORDER_MS = 7 * 24 * 60 * 60 * 1000;
const NO_CARRIER = '__none__';

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

function sortOrdersUrgentThenOldest(
  orders: SeparacaoLoteOrderRow[],
): SeparacaoLoteOrderRow[] {
  return [...orders].sort((a, b) => {
    const overdueA =
      getOverdueDays({
        status: a.status,
        requestedDeliveryDate: a.requestedDeliveryDate,
      } as OrderDto) ?? 0;
    const overdueB =
      getOverdueDays({
        status: b.status,
        requestedDeliveryDate: b.requestedDeliveryDate,
      } as OrderDto) ?? 0;
    if (overdueA !== overdueB) return overdueB - overdueA;
    const da = orderDateTs(a.orderDate);
    const db = orderDateTs(b.orderDate);
    if (da !== db) return da - db;
    return a.displayNumber.localeCompare(b.displayNumber, 'pt-BR');
  });
}

function isLoteOrderOld(order: SeparacaoLoteOrderRow): boolean {
  const ts = orderDateTs(order.orderDate);
  if (!Number.isFinite(ts) || ts === Number.POSITIVE_INFINITY) return false;
  return Date.now() - ts >= OLD_ORDER_MS;
}

function coverageOfProduct(
  totalQty: number,
  stockAvailable: number | null,
): CoverageFilter | 'unknown' {
  const tone = getStockAvailabilityTone(totalQty, stockAvailable);
  if (tone === 'unknown') return 'unknown';
  if (tone === 'ok') return 'ok';
  if (tone === 'partial') return 'partial';
  return 'none';
}

function CoverageBadge(props: { coverage: CoverageFilter | 'unknown' }) {
  const { coverage } = props;
  if (coverage === 'ok') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
        title="Estoque disponível cobre a demanda"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Coberto
      </span>
    );
  }
  if (coverage === 'partial') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
        title="Estoque parcial"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Parcial
      </span>
    );
  }
  if (coverage === 'none') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-700"
        title="Sem estoque disponível"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden />
        Sem estoque
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
      Estoque —
    </span>
  );
}

function filterControlClass() {
  return 'h-9 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 text-sm text-[var(--text-primary)]';
}

function selectedQtyForItems(
  orders: SeparacaoLoteOrderRow[],
  selectedItemIds: Set<string>,
): number {
  let qty = 0;
  for (const row of orders) {
    if (selectedItemIds.has(row.itemId)) qty += row.qty;
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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [sentBatch, setSentBatch] = useState<SentBatchSnapshot | null>(null);
  const [search, setSearch] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

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

  useEffect(() => {
    setCollapsedGroups(new Set());
  }, [groupBy]);

  const productsWithSortedOrders = useMemo(
    () =>
      products.map((product) => ({
        ...product,
        orders: sortOrdersOldestFirst(product.orders),
      })),
    [products],
  );

  const carrierOptions = useMemo(() => {
    const names = new Set<string>();
    let hasNone = false;
    for (const product of productsWithSortedOrders) {
      for (const order of product.orders) {
        const name = order.carrierName?.trim();
        if (name) names.add(name);
        else hasNone = true;
      }
    }
    return {
      names: [...names].sort((a, b) =>
        a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }),
      ),
      hasNone,
    };
  }, [productsWithSortedOrders]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result: SeparacaoLoteProductRow[] = [];

    for (const product of productsWithSortedOrders) {
      if (q) {
        const hay = `${product.sku} ${product.productName}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }

      let orders = product.orders;
      if (carrierFilter) {
        orders = orders.filter((order) => {
          const name = order.carrierName?.trim() || '';
          if (carrierFilter === NO_CARRIER) return !name;
          return name.toLowerCase() === carrierFilter.toLowerCase();
        });
      }
      if (urgencyFilter === 'atrasados') {
        orders = orders.filter(isLoteOrderOverdue);
      } else if (urgencyFilter === 'antigos') {
        orders = orders.filter(
          (order) => isLoteOrderOverdue(order) || isLoteOrderOld(order),
        );
      }
      if (orders.length === 0) continue;

      const totalQty = orders.reduce((sum, order) => sum + order.qty, 0);
      const coverage = coverageOfProduct(totalQty, product.stockAvailable);
      if (coverageFilter !== 'all' && coverage !== coverageFilter) continue;

      result.push({
        ...product,
        orders,
        totalQty,
        orderCount: orders.length,
      });
    }

    return result;
  }, [
    productsWithSortedOrders,
    search,
    carrierFilter,
    urgencyFilter,
    coverageFilter,
  ]);

  const coverageSummary = useMemo(() => {
    let covered = 0;
    let partial = 0;
    let none = 0;
    for (const product of filteredProducts) {
      const coverage = coverageOfProduct(
        product.totalQty,
        product.stockAvailable,
      );
      if (coverage === 'ok') covered += 1;
      else if (coverage === 'partial') partial += 1;
      else none += 1;
    }
    return {
      pending: filteredProducts.length,
      covered,
      partial,
      none,
    };
  }, [filteredProducts]);

  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', products: filteredProducts }];
    }

    const sections = new Map<string, SeparacaoLoteProductRow[]>();
    const add = (label: string, product: SeparacaoLoteProductRow) => {
      const list = sections.get(label) ?? [];
      list.push(product);
      sections.set(label, list);
    };

    if (groupBy === 'category') {
      for (const product of filteredProducts) {
        add(product.categoryName?.trim() || 'Sem categoria', product);
      }
    } else {
      for (const product of filteredProducts) {
        const byCarrier = new Map<string, SeparacaoLoteOrderRow[]>();
        for (const order of product.orders) {
          const label = order.carrierName?.trim() || 'Sem transportadora';
          const list = byCarrier.get(label) ?? [];
          list.push(order);
          byCarrier.set(label, list);
        }
        for (const [label, orders] of byCarrier) {
          const totalQty = orders.reduce((sum, order) => sum + order.qty, 0);
          add(label, {
            ...product,
            orders,
            totalQty,
            orderCount: orders.length,
          });
        }
      }
    }

    return [...sections.entries()]
      .sort((a, b) =>
        a[0].localeCompare(b[0], 'pt-BR', { sensitivity: 'base' }),
      )
      .map(([label, sectionProducts]) => ({
        key: label,
        label,
        products: sectionProducts,
      }));
  }, [filteredProducts, groupBy]);

  const reservationSummary = useMemo(() => {
    let units = 0;
    let productCount = 0;
    const orderIds = new Set<string>();
    for (const product of productsWithSortedOrders) {
      const qty = selectedQtyForItems(product.orders, selectedItemIds);
      if (qty <= 0) continue;
      units += qty;
      productCount += 1;
      for (const row of product.orders) {
        if (selectedItemIds.has(row.itemId)) orderIds.add(row.id);
      }
    }
    return {
      units,
      productCount,
      itemCount: selectedItemIds.size,
      orderCount: orderIds.size,
    };
  }, [productsWithSortedOrders, selectedItemIds]);

  const selectedCount = selectedItemIds.size;

  const autoSelectWhatFits = () => {
    const next = new Set<string>();
    for (const product of filteredProducts) {
      const stock = product.stockAvailable;
      if (stock === null || stock <= 0) continue;
      let remaining = stock;
      for (const row of sortOrdersUrgentThenOldest(product.orders)) {
        if (row.qty <= 0) continue;
        if (row.qty > remaining) continue;
        next.add(row.itemId);
        remaining -= row.qty;
        if (remaining <= 0) break;
      }
    }
    setSelectedItemIds(next);
  };

  const toggleExpand = (key: string) => {
    setExpandedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleAllInProduct = (orders: SeparacaoLoteOrderRow[]) => {
    const ids = orders.map((o) => o.itemId);
    const allSelected = ids.every((id) => selectedItemIds.has(id));
    setSelectedItemIds((prev) => {
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
    if (selectedItemIds.size === 0) {
      return [] as Array<{ productName: string; totalQty: number }>;
    }
    const totals = new Map<string, { productName: string; totalQty: number }>();
    for (const product of productsWithSortedOrders) {
      const qty = selectedQtyForItems(product.orders, selectedItemIds);
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
  }, [productsWithSortedOrders, selectedItemIds]);

  const handleSend = async () => {
    if (selectedItemIds.size === 0 || sending) return;
    setSending(true);
    setError(null);
    setConfirmOpen(false);

    const byOrder = new Map<string, string[]>();
    const orderedItemIds: string[] = [];
    for (const product of productsWithSortedOrders) {
      for (const row of product.orders) {
        if (!selectedItemIds.has(row.itemId)) continue;
        orderedItemIds.push(row.itemId);
        const list = byOrder.get(row.id) ?? [];
        list.push(row.itemId);
        byOrder.set(row.id, list);
      }
    }

    const coletaItems = buildColetaItems;
    const errors: string[] = [];
    let okOrders = 0;

    for (const [orderId, itemIds] of byOrder) {
      try {
        await erpFetchJson(`orders/${orderId}/send-to-picking`, {
          method: 'POST',
          body: JSON.stringify({ itemIds }),
        });
        okOrders += 1;
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `Falha ao enviar itens do pedido ${orderId}.`,
        );
      }
    }

    setSending(false);

    if (okOrders > 0) {
      setSentBatch({
        itemIds: orderedItemIds,
        orderIds: [...byOrder.keys()],
        items: coletaItems,
      });
      setSelectedItemIds(new Set());
      onSent?.();
      void loadResumo();
    }

    if (errors.length > 0) {
      setError(
        `${okOrders} pedido(s) enviado(s). Falhas: ${errors.slice(0, 3).join(' | ')}${
          errors.length > 3 ? '…' : ''
        }`,
      );
    }
  };

  const handlePrint = () => {
    const snapshot = sentBatch;
    if (!snapshot || snapshot.items.length === 0) return;
    void downloadColetaListaPdf({
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
              Seleção por item — reserva só o que for marcado (FIFO por urgência)
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
        {!loading && products.length > 0 ? (
          <div className="shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-muted)]/40 px-4 py-2 text-xs font-medium text-[var(--text-primary)]">
            {coverageSummary.pending} itens pendentes ·{' '}
            {coverageSummary.covered} totalmente cobertos ·{' '}
            {coverageSummary.partial} parciais · {coverageSummary.none} sem
            estoque
          </div>
        ) : null}

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
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar SKU ou nome do produto"
                    className={`${filterControlClass()} w-full pl-8`}
                    aria-label="Buscar SKU ou nome do produto"
                  />
                </label>
                <select
                  value={carrierFilter}
                  onChange={(e) => setCarrierFilter(e.target.value)}
                  className={filterControlClass()}
                  aria-label="Filtrar por transportadora"
                >
                  <option value="">Todas as transportadoras</option>
                  {carrierOptions.names.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  {carrierOptions.hasNone ? (
                    <option value={NO_CARRIER}>Sem transportadora</option>
                  ) : null}
                </select>
                <select
                  value={urgencyFilter}
                  onChange={(e) =>
                    setUrgencyFilter(e.target.value as UrgencyFilter)
                  }
                  className={filterControlClass()}
                  aria-label="Filtrar por urgência ou prazo"
                >
                  <option value="all">Urgência: todos</option>
                  <option value="atrasados">Só atrasados</option>
                  <option value="antigos">Atrasados e mais antigos</option>
                </select>
                <select
                  value={coverageFilter}
                  onChange={(e) =>
                    setCoverageFilter(e.target.value as CoverageFilter)
                  }
                  className={filterControlClass()}
                  aria-label="Filtrar por cobertura de estoque"
                >
                  <option value="all">Cobertura: todos</option>
                  <option value="ok">Totalmente cobertos</option>
                  <option value="partial">Parcialmente cobertos</option>
                  <option value="none">Sem estoque</option>
                </select>
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className={filterControlClass()}
                  aria-label="Agrupar lista"
                >
                  <option value="none">Agrupar por: nenhum</option>
                  <option value="category">Agrupar por: categoria</option>
                  <option value="carrier">Agrupar por: transportadora</option>
                </select>
              </div>

              {filteredProducts.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                  Nenhum item corresponde aos filtros.
                </p>
              ) : (
            <div className="space-y-3">
              {groupedSections.map((section) => {
                const groupCollapsed = collapsedGroups.has(section.key);
                return (
                  <section key={section.key} className="space-y-2">
                    {groupBy !== 'none' ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-lg bg-[var(--bg-muted)]/80 px-2 py-1.5 text-left text-sm font-semibold text-[var(--text-primary)]"
                        onClick={() => toggleGroup(section.key)}
                        aria-expanded={!groupCollapsed}
                      >
                        {groupCollapsed ? (
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {section.label}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-[var(--text-secondary)]">
                          {section.products.length} item
                          {section.products.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    ) : null}
                    {groupBy === 'none' || !groupCollapsed ? (
            <ul className="space-y-2">
              {section.products.map((product) => {
                const key = `${section.key}::${productKey(product)}`;
                const expanded = expandedSkus.has(key);
                const productItemIds = product.orders.map((o) => o.itemId);
                const selectedInProduct = productItemIds.filter((id) =>
                  selectedItemIds.has(id),
                ).length;
                const allSelected =
                  productItemIds.length > 0 &&
                  selectedInProduct === productItemIds.length;
                const markedQty = selectedQtyForItems(
                  product.orders,
                  selectedItemIds,
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
                const coverage = coverageOfProduct(
                  product.totalQty,
                  product.stockAvailable,
                );
                const stockLabel =
                  stock !== null ? `${stock}` : '—';

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
                      <CoverageBadge coverage={coverage} />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => toggleExpand(key)}
                      >
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {product.productName}
                          <span className="font-medium text-[var(--text-secondary)]">
                            {' '}
                            — {product.orderCount} pedido
                            {product.orderCount === 1 ? '' : 's'} / {stockLabel}{' '}
                            em estoque disponível
                          </span>
                        </span>
                        {product.sku && product.sku !== '(sem SKU)' ? (
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                            SKU {product.sku}
                          </span>
                        ) : null}
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
                          aria-label={`Selecionar todos os itens de ${product.productName}`}
                        />
                        Todos
                      </label>
                    </div>

                    {expanded ? (
                      <div className="border-t border-[var(--border-color)] bg-[var(--bg-muted)]/30 px-3 py-2">
                        <ul className="space-y-0.5">
                          {product.orders.map((row) => {
                            const overdue = isLoteOrderOverdue(row);
                            const dateLabel = formatOrderQueueDate(
                              row.orderDate,
                            );

                            return (
                              <li key={`${key}-${row.itemId}`}>
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
                                    checked={selectedItemIds.has(row.itemId)}
                                    onChange={() => toggleItem(row.itemId)}
                                  />
                                  <span className="tabular-nums">
                                    Pedido #{row.displayNumber} · linha{' '}
                                    {row.lineNumber} — {row.qty} un — Estoque:{' '}
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
                    ) : null}
                  </section>
                );
              })}
            </div>
              )}
            </div>
          )}

          {error && products.length > 0 ? (
            <p className="mt-3 text-sm text-red-500">{error}</p>
          ) : null}

          {sentBatch ? (
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              {sentBatch.itemIds.length} item
              {sentBatch.itemIds.length === 1 ? '' : 's'} enviado
              {sentBatch.itemIds.length === 1 ? '' : 's'} (
              {sentBatch.orderIds.length} pedido
              {sentBatch.orderIds.length === 1 ? '' : 's'}) para separação.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] px-4 py-3">
          <span className="text-sm text-[var(--text-secondary)]">
            {selectedCount} item{selectedCount === 1 ? '' : 's'} selecionado
            {selectedCount === 1 ? '' : 's'}
            {reservationSummary.orderCount > 0
              ? ` · ${reservationSummary.orderCount} pedido${
                  reservationSummary.orderCount === 1 ? '' : 's'
                }`
              : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
              onClick={autoSelectWhatFits}
              disabled={sending || filteredProducts.length === 0}
            >
              Selecionar automaticamente o que dá pra atender
            </button>
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
              onClick={() => setConfirmOpen(true)}
              disabled={sending || selectedCount === 0}
            >
              Enviar{' '}
              {selectedCount > 0
                ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} selecionado${
                    selectedCount === 1 ? '' : 's'
                  }`
                : 'itens selecionados'}
            </button>
          </div>
        </div>
      </div>
      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lote-confirm-title"
        >
          <div className="w-full max-w-md rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-xl">
            <h4
              id="lote-confirm-title"
              className="text-base font-semibold text-[var(--text-primary)]"
            >
              Confirmar reserva e envio
            </h4>
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              Você está reservando:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-primary)]">
              <li>
                {reservationSummary.units} unidade
                {reservationSummary.units === 1 ? '' : 's'} de{' '}
                {reservationSummary.productCount} produto
                {reservationSummary.productCount === 1 ? '' : 's'} diferente
                {reservationSummary.productCount === 1 ? '' : 's'}
              </li>
              <li>
                {reservationSummary.itemCount} item
                {reservationSummary.itemCount === 1 ? '' : 's'} em{' '}
                {reservationSummary.orderCount} pedido
                {reservationSummary.orderCount === 1 ? '' : 's'}
              </li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
                onClick={() => void handleSend()}
                disabled={sending}
              >
                {sending ? 'Enviando…' : 'Confirmar e Enviar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
