'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { OrderQueueCard } from '@/src/components/expedicao/workspace/order-queue-card';
import {
  countExpeditionUiFilters,
  OrderStatusFilters,
} from '@/src/components/expedicao/workspace/order-status-filters';
import {
  QueueQuickFilters,
  quickFilterToStatus,
  statusFilterToQuick,
  type QueueQuickFilterId,
} from '@/src/components/expedicao/workspace/queue-quick-filters';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';
import type { OrderDto } from '@/src/components/expedicao/shared/types';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

type PageItem = number | '...';

function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: PageItem[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) out.push('...');
  for (let n = start; n <= end; n += 1) out.push(n);
  if (end < total - 1) out.push('...');
  out.push(total);
  return out;
}

export function OrderQueue(props: {
  data: OrdersData;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  title?: string;
  onNewOrder?: () => void;
  onRefresh?: () => void;
}) {
  const {
    data,
    selectedOrderId,
    onSelectOrder,
    onOrderChosen,
    title = 'Fila de Pedidos p/ Separação',
    onNewOrder,
    onRefresh,
  } = props;

  const [quickFilter, setQuickFilter] = useState<QueueQuickFilterId>(() =>
    statusFilterToQuick(data.statusFilter),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setQuickFilter(statusFilterToQuick(data.statusFilter));
  }, [data.statusFilter]);

  const handleQuickChange = (id: QueueQuickFilterId) => {
    setQuickFilter(id);
    data.setPage(1);
    data.setStatusFilter(quickFilterToStatus(id));
  };

  const activeFilterCount = countExpeditionUiFilters(
    data.statusFilter,
    data.appliedFilters.search,
  );

  const quickCounts = {
    all: data.filterCounts?.all ?? data.sum?.totalPedidos,
    atrasado: data.sum?.atrasados,
    urgente: data.filterCounts?.urgente ?? data.sum?.urgentes,
    em_separacao: data.filterCounts?.em_separacao ?? data.sum?.emSeparacao,
  };

  const pageSize = data.meta?.pageSize ?? 20;
  const showingFrom = data.meta ? (data.meta.page - 1) * pageSize + 1 : 0;
  const showingTo = data.meta
    ? Math.min(data.meta.page * pageSize, data.meta.total)
    : data.orders.length;
  const pageItems = data.meta ? buildPageItems(data.page, data.meta.totalPages) : [];

  return (
    <aside className="exp-queue-panel">
      <div className="exp-queue-panel-header">
        <div className="exp-queue-header-row">
          <h2 className="exp-queue-panel-title">{title}</h2>
          <div className="flex shrink-0 gap-1">
            {onRefresh ? (
              <button
                type="button"
                className="exp-queue-icon-btn"
                onClick={onRefresh}
                aria-label="Atualizar fila"
              >
                <RefreshCw
                  className={`h-4 w-4 ${data.ordersLoading ? 'animate-spin' : ''}`}
                />
              </button>
            ) : null}
            {onNewOrder ? (
              <button
                type="button"
                className="exp-queue-icon-btn"
                onClick={onNewOrder}
                aria-label="Novo pedido"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="exp-queue-search-row">
          <div className="exp-queue-search-wrap">
            <Search className="exp-queue-search-icon" aria-hidden />
            <input
              type="search"
              value={data.appliedFilters.search}
              onChange={(e) => {
                data.setPage(1);
                data.setAppliedFilters((f) => ({ ...f, search: e.target.value }));
              }}
              placeholder="Buscar pedido, SKU, cliente, recebedor..."
              className="exp-queue-search"
            />
          </div>
          <div className="exp-queue-filters-btn-wrap">
            <button
              type="button"
              className={`exp-queue-filters-btn ${filtersOpen ? 'exp-queue-filters-btn--open' : ''}`}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              <Filter className="h-4 w-4" aria-hidden />
              Filtros
              {activeFilterCount > 0 ? (
                <span className="exp-queue-filters-badge">{activeFilterCount}</span>
              ) : null}
            </button>
            {filtersOpen ? (
              <div className="exp-queue-filters-dropdown">
                <OrderStatusFilters
                  active={data.statusFilter}
                  onChange={(id) => {
                    data.setPage(1);
                    data.setStatusFilter(id);
                    setQuickFilter(statusFilterToQuick(id));
                    setFiltersOpen(false);
                  }}
                  counts={data.filterCounts}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="exp-queue-panel-filters">
        <QueueQuickFilters
          active={quickFilter}
          onChange={handleQuickChange}
          counts={quickCounts}
        />
      </div>

      <div className="exp-queue-panel-list">
        {data.ordersLoading ? (
          <div className="exp-queue-empty">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            <p>Carregando pedidos…</p>
          </div>
        ) : data.orders.length === 0 ? (
          <p className="exp-queue-empty">Nenhum pedido neste filtro.</p>
        ) : (
          <div className="exp-queue-grid">
            {data.orders.map((o: OrderDto) => (
              <OrderQueueCard
                key={o.id}
                order={o}
                selected={selectedOrderId === o.id}
                onSelect={() => {
                  onSelectOrder(o.id);
                  onOrderChosen?.();
                }}
              />
            ))}
          </div>
        )}
      </div>

      {data.meta ? (
        <div className="exp-queue-panel-footer">
          <p className="exp-queue-footer-text">
            Mostrando {showingFrom}-{showingTo} de {data.meta.total} pedidos
          </p>
          {data.meta.totalPages > 1 ? (
            <div className="exp-queue-pagination">
              <button
                type="button"
                className="exp-queue-page-btn"
                disabled={data.page <= 1}
                onClick={() => data.setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageItems.map((item, idx) => {
                if (item === '...') {
                  return (
                    <span key={`ellipsis-${idx}`} className="exp-queue-page-ellipsis">
                      ...
                    </span>
                  );
                }
                return (
                  <button
                    key={item}
                    type="button"
                    className={`exp-queue-page-btn ${data.page === item ? 'exp-queue-page-btn--active' : ''}`}
                    onClick={() => data.setPage(item)}
                  >
                    {item}
                  </button>
                );
              })}
              <button
                type="button"
                className="exp-queue-page-btn"
                disabled={data.page >= data.meta.totalPages}
                onClick={() => data.setPage((p) => p + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
