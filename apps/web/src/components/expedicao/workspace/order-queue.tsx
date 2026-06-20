'use client';

import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { OrderQueueCard } from '@/src/components/expedicao/workspace/order-queue-card';
import {
  PedidosOrderStatusFilters,
  pedidosStatusFilterLabel,
  pedidosStatusFilterTone,
} from '@/src/components/expedicao/workspace/pedidos-order-status-filters';
import {
  PedidosNewFilterModal,
  type ExpeditionPedidosPreset,
} from '@/src/components/expedicao/workspace/pedidos-new-filter-modal';
import { PedidosPeriodFilter } from '@/src/components/expedicao/workspace/pedidos-period-filter';
import { RemoveFromSeparationModal } from '@/src/components/expedicao/workspace/remove-from-separation-modal';
import { pedidosStatusBadgeStyle } from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { mapOrderToPedidoParaImpressao } from '@/src/utils/map-order-to-waybill';
import { downloadWaybillPdf } from '@/src/utils/download-waybill-pdf';
import {
  ErpFilterBar,
  type FilterBadgeItem,
} from '@/src/components/shared/erp-filter-bar';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

type PageItem = number | '...';

const PEDIDOS_STATUS_FILTERS: StatusFilterId[] = [
  'all',
  'novo',
  'em_separacao',
  'aguardando_nf',
  'finalizado',
  'cancelado',
  'parcial',
];

const EXPEDITION_PEDIDOS_FILTER_KEY = 'erp.filters.expedicao.pedidos';

function normalizePedidosStatusFilter(id: string): StatusFilterId {
  if (id === 'cotacao') return 'all';
  return PEDIDOS_STATUS_FILTERS.includes(id as StatusFilterId)
    ? (id as StatusFilterId)
    : 'all';
}

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

function applyPedidosPreset(
  preset: ExpeditionPedidosPreset,
  data: OrdersData,
) {
  data.setPage(1);
  data.setStatusFilter(normalizePedidosStatusFilter(preset.statusFilter));
}

function isAguardandoNfStatus(status: string): boolean {
  return (
    status === 'SEPARADO' ||
    status === 'AGUARDANDO_NF' ||
    status === 'NF_ATRELADA'
  );
}

const SEPARATION_SECTIONS = [
  { id: 'em_separacao' as const, label: 'Em Separação' },
  { id: 'aguardando_nf' as const, label: 'Aguardando NF' },
] as const;

export function OrderQueue(props: {
  data: OrdersData;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  title?: string;
  onNewOrder?: () => void;
  onRefresh?: () => void;
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
  onDeleteOrder?: (order: OrderDto) => void;
  queueMode?: 'orders' | 'separation';
}) {
  const {
    data,
    selectedOrderId,
    onSelectOrder,
    onOrderChosen,
    title = 'Fila de Pedidos p/ Separação',
    onNewOrder,
    onRefresh,
    isAdmin = false,
    onEditOrder,
    onDeleteOrder,
    queueMode = 'orders',
  } = props;

  const isPedidosMode = queueMode === 'orders';

  const [selectedForRemovalIds, setSelectedForRemovalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedForPrintIds, setSelectedForPrintIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newFilterOpen, setNewFilterOpen] = useState(false);
  const [savedFiltersVersion, setSavedFiltersVersion] = useState(0);
  const [activeCustomFilterId, setActiveCustomFilterId] = useState<string | null>(
    null,
  );

  const filterBadges = useMemo((): FilterBadgeItem[] => {
    const badges: FilterBadgeItem[] = [];
    if (data.statusFilter !== 'all') {
      badges.push({
        key: `status:${data.statusFilter}`,
        label: isPedidosMode
          ? pedidosStatusFilterLabel(data.statusFilter)
          : data.statusFilter,
        tone: isPedidosMode ? pedidosStatusFilterTone(data.statusFilter) : undefined,
        style: isPedidosMode
          ? pedidosStatusBadgeStyle(data.statusFilter, true)
          : undefined,
      });
    }
    const q = data.appliedFilters.search.trim();
    if (q) {
      badges.push({ key: 'search', label: `Busca: ${q}` });
    }
    if (data.appliedFilters.orderDateFrom.trim()) {
      badges.push({
        key: 'dateFrom',
        label: `De: ${data.appliedFilters.orderDateFrom}`,
      });
    }
    if (data.appliedFilters.orderDateTo.trim()) {
      badges.push({
        key: 'dateTo',
        label: `Até: ${data.appliedFilters.orderDateTo}`,
      });
    }
    return badges;
  }, [data.statusFilter, data.appliedFilters, isPedidosMode]);

  const hasActiveFilters = filterBadges.length > 0;

  const presetValue = useMemo(
    (): ExpeditionPedidosPreset => ({
      statusFilter: data.statusFilter,
    }),
    [data.statusFilter],
  );

  const handleRemoveBadge = (key: string) => {
    data.setPage(1);
    if (key.startsWith('status:')) {
      setActiveCustomFilterId(null);
      data.setStatusFilter('all');
      return;
    }
    if (key === 'search') {
      data.setAppliedFilters((f) => ({ ...f, search: '' }));
      return;
    }
    if (key === 'dateFrom') {
      data.setAppliedFilters((f) => ({ ...f, orderDateFrom: '' }));
      return;
    }
    if (key === 'dateTo') {
      data.setAppliedFilters((f) => ({ ...f, orderDateTo: '' }));
    }
  };

  const handleClearAll = () => {
    data.setPage(1);
    setActiveCustomFilterId(null);
    data.setStatusFilter('all');
    data.setAppliedFilters((f) => ({
      ...f,
      search: '',
      orderDateFrom: '',
      orderDateTo: '',
    }));
  };

  const pageSize = data.meta?.pageSize ?? 20;
  const showingFrom = data.meta ? (data.meta.page - 1) * pageSize + 1 : 0;
  const showingTo = data.meta
    ? Math.min(data.meta.page * pageSize, data.meta.total)
    : data.orders.length;
  const pageItems = data.meta ? buildPageItems(data.page, data.meta.totalPages) : [];
  const selectedForPrintCount = selectedForPrintIds.size;
  const selectedForRemovalCount = selectedForRemovalIds.size;

  const togglePrintSelection = (orderId: string) => {
    setSelectedForPrintIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleRemovalSelection = (orderId: string) => {
    setSelectedForRemovalIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleConfirmRemoveFromSeparation = async () => {
    const targets = data.orders.filter((o) => selectedForRemovalIds.has(o.id));
    if (targets.length === 0) return;
    setRemoving(true);
    const ok = await data.removeOrdersFromSeparation(targets);
    setRemoving(false);
    if (ok) {
      setRemoveModalOpen(false);
      setSelectedForRemovalIds(new Set());
    }
  };

  const handleSavePdf = () => {
    const pedidos = data.orders
      .filter((o) => selectedForPrintIds.has(o.id))
      .map(mapOrderToPedidoParaImpressao);
    downloadWaybillPdf(pedidos);
  };

  const separationSections = useMemo(() => {
    if (isPedidosMode) return null;
    return SEPARATION_SECTIONS.map((section) => ({
      ...section,
      orders: data.orders.filter((o) =>
        section.id === 'em_separacao'
          ? o.status === 'EM_SEPARACAO'
          : isAguardandoNfStatus(o.status),
      ),
    }));
  }, [data.orders, isPedidosMode]);

  const renderOrderCard = (o: OrderDto) => (
    <OrderQueueCard
      key={o.id}
      order={o}
      selected={selectedOrderId === o.id}
      checkedForPrint={isPedidosMode ? selectedForPrintIds.has(o.id) : undefined}
      onTogglePrint={isPedidosMode ? () => togglePrintSelection(o.id) : undefined}
      checkedForRemoval={!isPedidosMode ? selectedForRemovalIds.has(o.id) : undefined}
      onToggleRemoval={!isPedidosMode ? () => toggleRemovalSelection(o.id) : undefined}
      onSelect={() => {
        onSelectOrder(o.id);
        onOrderChosen?.();
      }}
      showAdminActions={isAdmin}
      onEdit={onEditOrder ? () => onEditOrder(o) : undefined}
      onDelete={onDeleteOrder ? () => onDeleteOrder(o) : undefined}
    />
  );

  return (
    <aside className="exp-queue-panel">
      <div className="exp-queue-panel-header">
        <div className="exp-queue-header-row">
          <h2 className="exp-queue-panel-title">{title}</h2>
          <div className="exp-queue-header-actions">
            {isPedidosMode ? (
              <PedidosPeriodFilter
                dateFrom={data.appliedFilters.orderDateFrom}
                dateTo={data.appliedFilters.orderDateTo}
                onChange={(from, to) => {
                  data.setPage(1);
                  data.setAppliedFilters((f) => ({
                    ...f,
                    orderDateFrom: from,
                    orderDateTo: to,
                  }));
                }}
              />
            ) : null}
            {onRefresh ? (
              <button
                type="button"
                className="exp-queue-header-btn exp-queue-header-btn--icon"
                onClick={onRefresh}
                aria-label="Atualizar fila"
              >
                <RefreshCw
                  className={`h-4 w-4 ${data.ordersLoading ? 'animate-spin' : ''}`}
                />
              </button>
            ) : null}
            {isPedidosMode ? (
              <button
                type="button"
                className={`exp-queue-header-btn ${filtersOpen ? 'exp-queue-header-btn--open' : ''}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Filter className="h-4 w-4" aria-hidden />
                Filtros
                {filterBadges.length > 0 ? (
                  <span className="exp-queue-header-btn-count">{filterBadges.length}</span>
                ) : null}
              </button>
            ) : null}
            {onNewOrder ? (
              <button
                type="button"
                className="exp-queue-header-btn exp-queue-header-btn--primary"
                onClick={onNewOrder}
              >
                + Novo Pedido
              </button>
            ) : null}
          </div>
        </div>

        {isPedidosMode ? (
          <ErpFilterBar<ExpeditionPedidosPreset>
            storageKey={EXPEDITION_PEDIDOS_FILTER_KEY}
            badges={filterBadges}
            hasActiveFilters={hasActiveFilters}
            onRemoveBadge={handleRemoveBadge}
            onClearAll={handleClearAll}
            presetValue={presetValue}
            hideFilterButton
            hideSavedPresetsList
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            savedFiltersVersion={savedFiltersVersion}
            createFilterLabel="+ Novo Filtro"
            onCreateFilter={() => {
              setNewFilterOpen(true);
              setFiltersOpen(false);
            }}
            onApplyPreset={(preset) => {
              setActiveCustomFilterId(null);
              applyPedidosPreset(preset, data);
            }}
            searchSlot={
              <div className="exp-queue-search-wrap erp-filter-search-slot">
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
            }
          >
            <PedidosOrderStatusFilters
              active={data.statusFilter}
              activeCustomFilterId={activeCustomFilterId}
              storageKey={EXPEDITION_PEDIDOS_FILTER_KEY}
              savedFiltersVersion={savedFiltersVersion}
              onSavedFiltersChange={() => {
                setSavedFiltersVersion((v) => v + 1);
                if (activeCustomFilterId) {
                  setActiveCustomFilterId(null);
                }
              }}
              onChange={(id) => {
                data.setPage(1);
                setActiveCustomFilterId(null);
                data.setStatusFilter(id);
              }}
              onApplyCustomFilter={(preset, filterId) => {
                setActiveCustomFilterId(filterId);
                applyPedidosPreset(
                  { statusFilter: preset.statusFilter ?? 'all' },
                  data,
                );
                setFiltersOpen(false);
              }}
            />
          </ErpFilterBar>
        ) : null}
      </div>

      {isPedidosMode ? (
        <PedidosNewFilterModal
          isOpen={newFilterOpen}
          storageKey={EXPEDITION_PEDIDOS_FILTER_KEY}
          onClose={() => setNewFilterOpen(false)}
          onSaved={() => {
            setSavedFiltersVersion((v) => v + 1);
            setFiltersOpen(true);
          }}
        />
      ) : null}

      {isPedidosMode ? (
        <div className="exp-queue-print-toolbar">
          {selectedForPrintCount > 0 ? (
            <span className="exp-queue-print-count">
              {selectedForPrintCount} pedido(s) selecionado(s)
            </span>
          ) : (
            <span className="exp-queue-print-count exp-queue-print-count--empty" />
          )}
          <button
            type="button"
            className="exp-queue-print-btn"
            disabled={selectedForPrintCount === 0}
            onClick={handleSavePdf}
          >
            <Download className="h-4 w-4" aria-hidden />
            Salvar PDF
          </button>
        </div>
      ) : (
        <div className="exp-queue-print-toolbar">
          {selectedForRemovalCount > 0 ? (
            <span className="exp-queue-print-count">
              {selectedForRemovalCount} pedido(s) selecionado(s)
            </span>
          ) : (
            <span className="exp-queue-print-count exp-queue-print-count--empty" />
          )}
          <button
            type="button"
            className="exp-queue-remove-sep-btn"
            disabled={selectedForRemovalCount === 0}
            onClick={() => setRemoveModalOpen(true)}
          >
            Remover da Separação
          </button>
        </div>
      )}

      {removeModalOpen ? (
        <RemoveFromSeparationModal
          count={selectedForRemovalCount}
          loading={removing}
          onCancel={() => setRemoveModalOpen(false)}
          onConfirm={() => void handleConfirmRemoveFromSeparation()}
        />
      ) : null}

      <div className="exp-queue-panel-list">
        {data.ordersLoading ? (
          <div className="exp-queue-empty">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            <p>Carregando pedidos…</p>
          </div>
        ) : data.orders.length === 0 ? (
          <p className="exp-queue-empty">Nenhum pedido neste filtro.</p>
        ) : isPedidosMode ? (
          <div className="exp-queue-grid">{data.orders.map(renderOrderCard)}</div>
        ) : separationSections ? (
          <div className="exp-queue-sections">
            {separationSections.map((section) => (
              <section key={section.id} className="exp-queue-section">
                <h3 className="exp-queue-section-title">{section.label}</h3>
                {section.orders.length === 0 ? (
                  <p className="exp-queue-section-empty">Nenhum pedido nesta etapa.</p>
                ) : (
                  <div className="exp-queue-grid">{section.orders.map(renderOrderCard)}</div>
                )}
              </section>
            ))}
          </div>
        ) : null}
      </div>

      {data.meta && !data.ordersLoading && isPedidosMode ? (
        <div className="exp-queue-panel-footer">
          <p className="exp-queue-footer-text">
            Mostrando {showingFrom}-{showingTo} de {data.meta.total} pedidos
          </p>
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
        </div>
      ) : null}
    </aside>
  );
}
