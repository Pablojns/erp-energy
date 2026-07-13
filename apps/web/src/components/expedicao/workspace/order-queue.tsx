'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Filter,
  PackageOpen,
  RefreshCw,
  Search,
  Truck,
  X,
} from 'lucide-react';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import { MobileBottomDrawer } from '@/src/components/mobile/mobile-bottom-drawer';
import { OrderQueueCard } from '@/src/components/expedicao/workspace/order-queue-card';
import { PedidosOrdersTable } from '@/src/components/expedicao/workspace/pedidos-orders-table';
import {
  pedidosStatusFilterLabel,
  pedidosStatusFilterTone,
} from '@/src/components/expedicao/workspace/pedidos-order-status-filters';
import {
  PedidosNewFilterModal,
} from '@/src/components/expedicao/workspace/pedidos-new-filter-modal';
import { PedidosSavedFiltersBar } from '@/src/components/expedicao/workspace/pedidos-saved-filters-bar';
import {
  normalizeExpeditionPedidosPreset,
  pedidosFiltersStorageKey,
  type ExpeditionPedidosPreset,
  type PedidosSourceTab,
} from '@/src/components/expedicao/workspace/pedidos-saved-filter-types';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { PedidosPeriodFilter } from '@/src/components/expedicao/workspace/pedidos-period-filter';
import { RemoveFromSeparationModal } from '@/src/components/expedicao/workspace/remove-from-separation-modal';
import { pedidosStatusBadgeStyle } from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { PedidosFilterField, StatusFilterId } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { mapOrderToPedidoParaImpressao } from '@/src/utils/map-order-to-waybill';
import { downloadWaybillPdf } from '@/src/utils/download-waybill-pdf';
import {
  type FilterBadgeItem,
} from '@/src/components/shared/erp-filter-bar';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  InlineLoadMoreSkeleton,
  ListSkeleton,
} from '@/src/components/ui/skeleton';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

const PEDIDOS_STATUS_FILTERS: StatusFilterId[] = [
  'all',
  'novo',
  'atrasado',
  'urgente',
  'parcial',
  'pronto_separacao',
  'em_separacao',
  'aguardando_nf',
  'finalizado',
  'cancelado',
];

const HEADER_STATUS_FILTERS: Array<{ id: StatusFilterId; label: string }> = [
  { id: 'novo', label: 'Novo' },
  { id: 'atrasado', label: 'Atrasados' },
  { id: 'urgente', label: 'Urgentes' },
  { id: 'parcial', label: 'Parcial' },
  { id: 'pronto_separacao', label: 'Reservado' },
  { id: 'em_separacao', label: 'Em Separação' },
  { id: 'aguardando_nf', label: 'Aguardando NF' },
  { id: 'finalizado', label: 'Finalizado' },
  { id: 'cancelado', label: 'Cancelado' },
];

function headerStatusFilterLabel(id: StatusFilterId): string {
  return HEADER_STATUS_FILTERS.find((f) => f.id === id)?.label ?? pedidosStatusFilterLabel(id);
}

function headerStatusFilterTone(id: StatusFilterId): string | undefined {
  if (id === 'atrasado') return 'atrasado';
  if (id === 'pronto_separacao') return 'pronto_separacao';
  return pedidosStatusFilterTone(id);
}

function headerStatusFilterStyle(id: StatusFilterId, active: boolean) {
  if (id === 'atrasado') {
    return {
      background: '#b45309',
      color: 'var(--color-text-inverse)',
      border: 'none',
      ...(active
        ? {
            boxShadow:
              '0 0 0 2px var(--bg-card), 0 0 0 4px color-mix(in srgb, var(--bg-card) 35%, transparent)',
          }
        : {}),
    };
  }
  if (id === 'pronto_separacao') {
    return pedidosStatusBadgeStyle('novo', active);
  }
  return pedidosStatusBadgeStyle(headerStatusFilterTone(id), active);
}

function buildCurrentPedidosPreset(
  data: OrdersData,
  sourceFilter: PedidosSourceTab | undefined,
): ExpeditionPedidosPreset {
  return {
    source: sourceFilter ?? 'WEG',
    statusFilter: data.statusFilter,
    filterField: data.appliedFilters.filterField,
    filterValue: data.appliedFilters.filterValue,
    sortBy: data.sortBy,
    sortOrder: data.sortOrder,
  };
}

function applyPedidosPreset(
  preset: ExpeditionPedidosPreset,
  data: OrdersData,
  onSourceFilterChange?: (value: PedidosSourceTab) => void,
  customFilterId?: string | null,
  setActiveCustomFilterId?: (id: string | null) => void,
) {
  const normalized = normalizeExpeditionPedidosPreset(preset);
  data.setPage(1);
  data.setStatusFilter(normalizePedidosStatusFilter(normalized.statusFilter));
  data.setAppliedFilters((f) => ({
    ...f,
    filterField: normalized.filterField,
    filterValue: normalized.filterValue,
  }));
  data.setSortBy(normalized.sortBy);
  data.setSortOrder(normalized.sortOrder);
  onSourceFilterChange?.(normalized.source);
  if (setActiveCustomFilterId) {
    setActiveCustomFilterId(customFilterId ?? null);
  }
}
const PEDIDOS_FIELD_FILTER_OPTIONS: Array<{
  value: PedidosFilterField;
  label: string;
  placeholder: string;
}> = [
  { value: 'invoiceNumber', label: 'Nota Fiscal', placeholder: 'Digite a NF...' },
  { value: 'receiverName', label: 'Recebedor', placeholder: 'Digite o recebedor...' },
  {
    value: 'unloadingPoint',
    label: 'Ponto de Descarga',
    placeholder: 'Digite o ponto de descarga...',
  },
];

function pedidosFieldFilterLabel(field: PedidosFilterField): string {
  return PEDIDOS_FIELD_FILTER_OPTIONS.find((o) => o.value === field)?.label ?? field;
}

function pedidosFieldFilterPlaceholder(field: PedidosFilterField): string {
  return (
    PEDIDOS_FIELD_FILTER_OPTIONS.find((o) => o.value === field)?.placeholder ??
    'Digite o valor...'
  );
}

function normalizePedidosStatusFilter(id: string): StatusFilterId {
  if (id === 'cotacao') return 'all';
  return PEDIDOS_STATUS_FILTERS.includes(id as StatusFilterId)
    ? (id as StatusFilterId)
    : 'all';
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

/* Header padrão (todas as abas): height 32px */
const HEADER_BTN_ICON =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-transparent text-[var(--text-primary)] transition hover:bg-gray-100';

export function OrderQueue(props: {
  data: OrdersData;
  selectedOrderId: string | null;
  onSelectOrder: (id: string) => void;
  onOrderChosen?: () => void;
  title?: string;
  onNewOrder?: () => void;
  onNewSiteOrder?: () => void;
  onNewVendaExterna?: () => void;
  onImportWeg?: () => void;
  sourceFilter?: 'WEG' | 'SITE' | 'VENDA_EXTERNA';
  onSourceFilterChange?: (value: 'WEG' | 'SITE' | 'VENDA_EXTERNA') => void;
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
    onNewSiteOrder,
    onNewVendaExterna,
    onImportWeg,
    sourceFilter,
    onSourceFilterChange,
    onRefresh,
    isAdmin = false,
    onEditOrder,
    onDeleteOrder,
    queueMode = 'orders',
  } = props;

  const isPedidosMode = queueMode === 'orders';
  const { user } = useNavPermissions();
  const pedidosFiltersKey = pedidosFiltersStorageKey(user.id);

  const [selectedForRemovalIds, setSelectedForRemovalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [selectedForPrintIds, setSelectedForPrintIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [newFilterOpen, setNewFilterOpen] = useState(false);
  const [savedFiltersVersion, setSavedFiltersVersion] = useState(0);
  const [activeCustomFilterId, setActiveCustomFilterId] = useState<string | null>(
    null,
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pedidosTableScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreQueuedRef = useRef(false);
  const filtersWrapRef = useRef<HTMLDivElement>(null);

  const pullRefresh = usePullToRefresh({
    onRefresh: async () => {
      onRefresh?.();
      await data.refreshAll();
    },
  });

  const openFilters = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setFiltersDrawerOpen(true);
      return;
    }
    setFiltersOpen((v) => !v);
  };

  const filterBadges = useMemo((): FilterBadgeItem[] => {
    const badges: FilterBadgeItem[] = [];
    if (data.statusFilter !== 'all') {
      badges.push({
        key: `status:${data.statusFilter}`,
        label: isPedidosMode
          ? headerStatusFilterLabel(data.statusFilter)
          : data.statusFilter,
        tone: isPedidosMode ? headerStatusFilterTone(data.statusFilter) : undefined,
        style: isPedidosMode
          ? headerStatusFilterStyle(data.statusFilter, true)
          : undefined,
      });
    }
    const q = data.appliedFilters.search.trim();
    if (q) {
      badges.push({ key: 'search', label: `Busca: ${q}` });
    }
    if (data.appliedFilters.filterField && data.appliedFilters.filterValue.trim()) {
      badges.push({
        key: 'fieldFilter',
        label: `${pedidosFieldFilterLabel(data.appliedFilters.filterField)}: ${data.appliedFilters.filterValue.trim()}`,
      });
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
    (): ExpeditionPedidosPreset =>
      buildCurrentPedidosPreset(data, sourceFilter),
    [
      data.statusFilter,
      data.appliedFilters.filterField,
      data.appliedFilters.filterValue,
      data.sortBy,
      data.sortOrder,
      sourceFilter,
    ],
  );

  const handleClearAll = () => {
    data.setPage(1);
    setActiveCustomFilterId(null);
    data.setStatusFilter('all');
    data.setAppliedFilters((f) => ({
      ...f,
      search: '',
      filterField: '',
      filterValue: '',
      orderDateFrom: '',
      orderDateTo: '',
    }));
  };

  useEffect(() => {
    if (!filtersOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!filtersWrapRef.current?.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [filtersOpen]);

  const selectedForPrintCount = selectedForPrintIds.size;
  const selectedForRemovalCount = selectedForRemovalIds.size;

  useEffect(() => {
    if (!data.ordersLoadingMore) {
      loadMoreQueuedRef.current = false;
    }
  }, [data.ordersLoadingMore]);

  useEffect(() => {
    if (!data.ordersHasMore) return;
    const sentinel = loadMoreSentinelRef.current;
    const root = isPedidosMode
      ? pedidosTableScrollRef.current
      : listScrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (data.ordersLoading || data.ordersLoadingMore || loadMoreQueuedRef.current) {
          return;
        }
        loadMoreQueuedRef.current = true;
        data.loadMoreOrders();
      },
      { root, rootMargin: '48px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    isPedidosMode,
    data.ordersHasMore,
    data.loadMoreOrders,
    data.orders.length,
    data.ordersLoading,
    data.ordersLoadingMore,
  ]);

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

  const handleStatusFilterChange = (id: StatusFilterId) => {
    data.setPage(1);
    setActiveCustomFilterId(null);
    data.setStatusFilter(id);
  };

  const periodFilterNode = (
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
  );

  const refreshButton = onRefresh ? (
    <button
      type="button"
      className={`${HEADER_BTN_ICON} exp-queue-toolbar-btn shrink-0`}
      onClick={onRefresh}
      aria-label="Atualizar fila"
    >
      <RefreshCw className={`h-4 w-4 ${data.ordersLoading ? 'animate-spin' : ''}`} />
    </button>
  ) : null;

  return (
    <aside className="exp-queue-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="exp-queue-panel-header shrink-0 border-b border-[var(--exp-border)]">
        {isPedidosMode ? (
          <div className="exp-queue-filters-area">
            <div className="exp-queue-toolbar-row-1">
              <div className="exp-queue-filters-btn-wrap" ref={filtersWrapRef}>
                <button
                  type="button"
                  className={`exp-queue-filters-btn exp-queue-toolbar-btn ${filtersOpen ? 'exp-queue-filters-btn--open' : ''}`}
                  onClick={openFilters}
                  aria-expanded={filtersOpen}
                >
                  <Filter className="h-4 w-4 shrink-0" aria-hidden />
                  Filtros
                  {hasActiveFilters ? (
                    <span className="exp-queue-filters-badge">{filterBadges.length}</span>
                  ) : null}
                </button>
                {filtersOpen ? (
                  <div className="exp-queue-filters-dropdown exp-queue-filters-dropdown--status">
                    <div className="exp-queue-status-filter-list">
                      {HEADER_STATUS_FILTERS.map((f) => {
                        const on = data.statusFilter === f.id;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            className="exp-queue-status-filter-item"
                            style={headerStatusFilterStyle(f.id, on)}
                            onClick={() => {
                              handleStatusFilterChange(f.id);
                              setFiltersOpen(false);
                            }}
                          >
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        className="exp-queue-filters-clear-btn"
                        onClick={() => {
                          handleClearAll();
                          setFiltersOpen(false);
                        }}
                      >
                        Limpar filtros
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="exp-queue-save-filter-btn exp-queue-toolbar-btn shrink-0"
                onClick={() => setNewFilterOpen(true)}
              >
                Salvar filtro
              </button>
              <div className="exp-queue-toolbar-period shrink-0">{periodFilterNode}</div>
              <button
                type="button"
                className="exp-queue-print-btn exp-queue-print-btn--inline exp-queue-toolbar-btn shrink-0"
                disabled={selectedForPrintCount === 0}
                onClick={handleSavePdf}
              >
                <Download className="h-4 w-4 shrink-0" aria-hidden />
                Salvar PDF
              </button>
              {refreshButton}
            </div>

            <div className="exp-queue-toolbar-row-2">
              <div className="exp-queue-search-wrap min-w-0 flex-1">
                <Search className="exp-queue-search-icon" aria-hidden />
                <input
                  type="search"
                  value={data.appliedFilters.search}
                  onChange={(e) => {
                    data.setPage(1);
                    setActiveCustomFilterId(null);
                    data.setAppliedFilters((f) => ({ ...f, search: e.target.value }));
                  }}
                  placeholder="Buscar pedido..."
                  className="exp-queue-search exp-queue-search--compact"
                  aria-label="Buscar por número do pedido"
                />
              </div>
              {data.appliedFilters.filterField ? (
                <div className="exp-queue-search-wrap min-w-0 flex-1">
                  <input
                    type="search"
                    value={data.appliedFilters.filterValue}
                    onChange={(e) => {
                      data.setPage(1);
                      setActiveCustomFilterId(null);
                      data.setAppliedFilters((f) => ({
                        ...f,
                        filterValue: e.target.value,
                      }));
                    }}
                    placeholder={pedidosFieldFilterPlaceholder(
                      data.appliedFilters.filterField,
                    )}
                    className="exp-queue-search exp-queue-search--compact exp-queue-search--iconless"
                    aria-label={`Valor do filtro ${pedidosFieldFilterLabel(data.appliedFilters.filterField)}`}
                  />
                </div>
              ) : null}
              <select
                value={data.appliedFilters.filterField}
                onChange={(e) => {
                  data.setPage(1);
                  setActiveCustomFilterId(null);
                  const next = e.target.value as PedidosFilterField;
                  data.setAppliedFilters((f) => ({
                    ...f,
                    filterField: next,
                    filterValue: next ? f.filterValue : '',
                  }));
                }}
                className="exp-queue-filter-select shrink-0"
                aria-label="Filtrar por campo"
              >
                <option value="">Filtrar por...</option>
                {PEDIDOS_FIELD_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {data.appliedFilters.filterField ? (
                <button
                  type="button"
                  onClick={() => {
                    data.setPage(1);
                    setActiveCustomFilterId(null);
                    data.setAppliedFilters((f) => ({
                      ...f,
                      filterField: '',
                      filterValue: '',
                    }));
                  }}
                  className={`${HEADER_BTN_ICON} shrink-0`}
                  aria-label="Limpar filtro selecionado"
                  title="Limpar filtro"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>

            <PedidosSavedFiltersBar
              storageKey={pedidosFiltersKey}
              savedFiltersVersion={savedFiltersVersion}
              activeCustomFilterId={activeCustomFilterId}
              onApply={(preset, filterId) => {
                applyPedidosPreset(
                  preset,
                  data,
                  onSourceFilterChange,
                  filterId,
                  setActiveCustomFilterId,
                );
              }}
              onDelete={(filterId) => {
                setSavedFiltersVersion((v) => v + 1);
                if (activeCustomFilterId === filterId) {
                  setActiveCustomFilterId(null);
                }
              }}
            />
          </div>
        ) : (
          <div className="exp-queue-header-row !mb-1.5 !gap-2">
            {title ? <h2 className="exp-queue-panel-title text-sm">{title}</h2> : null}
            <div className="exp-queue-header-actions !gap-2">
              {refreshButton}
            </div>
          </div>
        )}

      </div>

      {isPedidosMode ? (
        <PedidosNewFilterModal
          isOpen={newFilterOpen}
          storageKey={pedidosFiltersKey}
          preset={presetValue}
          onClose={() => setNewFilterOpen(false)}
          onSaved={() => {
            setSavedFiltersVersion((v) => v + 1);
          }}
        />
      ) : null}

      {!isPedidosMode ? (
        <div className="exp-queue-print-toolbar shrink-0">
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
      ) : null}

      {removeModalOpen ? (
        <RemoveFromSeparationModal
          count={selectedForRemovalCount}
          loading={removing}
          onCancel={() => setRemoveModalOpen(false)}
          onConfirm={() => void handleConfirmRemoveFromSeparation()}
        />
      ) : null}

      <div
        ref={listScrollRef}
        className={`exp-queue-panel-list erp-scrollbar min-h-0 w-full flex-1 overflow-x-hidden ${
          isPedidosMode
            ? 'flex flex-col overflow-hidden !p-2.5'
            : 'overflow-y-auto !p-2.5'
        }`}
        {...pullRefresh.handlers}
      >
        <div
          className="erp-ptr-indicator md:hidden"
          style={{ height: pullRefresh.pullDistance > 0 || pullRefresh.refreshing ? 32 : 0 }}
        >
          {pullRefresh.refreshing ? 'Atualizando…' : pullRefresh.pullDistance > 48 ? 'Solte para atualizar' : ''}
        </div>
        {data.ordersLoading && data.orders.length === 0 ? (
          <div className="exp-queue-empty p-2">
            <ListSkeleton rows={6} />
          </div>
        ) : data.orders.length === 0 ? (
          <div className="p-3">
            <EmptyState
              compact
              icon={isPedidosMode ? Truck : PackageOpen}
              title={
                isPedidosMode ? 'Nenhum pedido encontrado' : 'Nenhum pedido nesta etapa'
              }
              description={
                isPedidosMode
                  ? 'Importe pedidos WEG ou crie um pedido manual para começar.'
                  : 'Os pedidos em separação aparecerão aqui conforme forem liberados.'
              }
              actionLabel={isPedidosMode && onImportWeg ? 'Importar WEG' : undefined}
              onAction={isPedidosMode && onImportWeg ? onImportWeg : undefined}
            />
          </div>
        ) : isPedidosMode ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PedidosOrdersTable
              userId={user.id}
              orders={data.orders}
              selectedOrderId={selectedOrderId}
              onSelectOrder={onSelectOrder}
              onOrderChosen={onOrderChosen}
              selectedForPrintIds={selectedForPrintIds}
              onTogglePrint={togglePrintSelection}
              isAdmin={isAdmin}
              onEditOrder={onEditOrder}
              onDeleteOrder={onDeleteOrder}
              scrollContainerRef={pedidosTableScrollRef}
              listFooter={
                <>
                  {data.ordersHasMore ? (
                    <div
                      ref={loadMoreSentinelRef}
                      className="exp-queue-load-more-sentinel shrink-0"
                      aria-hidden
                    />
                  ) : null}
                  {data.ordersLoadingMore ? (
                    <InlineLoadMoreSkeleton label="Carregando mais pedidos" />
                  ) : null}
                </>
              }
            />
          </div>
        ) : separationSections ? (
          <>
            <div className="exp-queue-sections gap-2">
              {separationSections.map((section) => (
                <section key={section.id} className="exp-queue-section">
                  <h3 className="exp-queue-section-title">{section.label}</h3>
                  {section.orders.length === 0 ? (
                    <p className="exp-queue-section-empty text-xs text-[var(--text-muted)]">
                      Nenhum pedido nesta etapa.
                    </p>
                  ) : (
                    <div className="grid w-full grid-cols-1 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4">
                      {section.orders.map(renderOrderCard)}
                    </div>
                  )}
                </section>
              ))}
            </div>
            {data.ordersHasMore ? (
              <div ref={loadMoreSentinelRef} className="exp-queue-load-more-sentinel" />
            ) : null}
            {data.ordersLoadingMore ? (
              <InlineLoadMoreSkeleton label="Carregando mais pedidos" />
            ) : null}
          </>
        ) : null}
      </div>

      {data.meta && !data.ordersLoading && isPedidosMode ? (
        <div className="exp-queue-panel-footer shrink-0">
          <p className="exp-queue-footer-text">
            {data.orders.length} de {data.meta.total} pedido(s)
          </p>
        </div>
      ) : null}

      <MobileBottomDrawer
        open={filtersDrawerOpen}
        onClose={() => setFiltersDrawerOpen(false)}
        title="Filtros"
      >
        <div className="exp-queue-status-filter-list">
          {HEADER_STATUS_FILTERS.map((f) => {
            const on = data.statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                className="exp-queue-status-filter-item min-h-[44px] w-full"
                style={headerStatusFilterStyle(f.id, on)}
                onClick={() => {
                  handleStatusFilterChange(f.id);
                  setFiltersDrawerOpen(false);
                }}
              >
                {f.label}
              </button>
            );
          })}
          {hasActiveFilters ? (
            <button
              type="button"
              className="exp-queue-filters-clear-btn min-h-[44px] w-full"
              onClick={() => {
                handleClearAll();
                setFiltersDrawerOpen(false);
              }}
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      </MobileBottomDrawer>
    </aside>
  );
}
