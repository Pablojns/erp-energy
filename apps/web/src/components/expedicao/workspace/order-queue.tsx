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
import { OrderQueueCard } from '@/src/components/expedicao/workspace/order-queue-card';
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
  ErpFilterBar,
  type FilterBadgeItem,
} from '@/src/components/shared/erp-filter-bar';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  CardGridSkeleton,
  InlineLoadMoreSkeleton,
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
  { id: 'all', label: 'Todos' },
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

/* Header padrão (todas as abas): botões px-3 py-1.5 text-sm */
const HEADER_BTN_SECONDARY =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/5';
const HEADER_BTN_PRIMARY =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500';

/* Pills de status: text-xs px-3 py-1; ativa azul sólido, inativa borda sutil */
const STATUS_PILL_ACTIVE =
  'shrink-0 whitespace-nowrap rounded-md border border-transparent bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition';
const STATUS_PILL_INACTIVE =
  'shrink-0 whitespace-nowrap rounded-md border border-white/20 bg-transparent px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]';

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
  const [newFilterOpen, setNewFilterOpen] = useState(false);
  const [savedFiltersVersion, setSavedFiltersVersion] = useState(0);
  const [activeCustomFilterId, setActiveCustomFilterId] = useState<string | null>(
    null,
  );
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

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
    if (key === 'fieldFilter') {
      data.setAppliedFilters((f) => ({ ...f, filterField: '', filterValue: '' }));
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
      filterField: '',
      filterValue: '',
      orderDateFrom: '',
      orderDateTo: '',
    }));
  };

  const selectedForPrintCount = selectedForPrintIds.size;
  const selectedForRemovalCount = selectedForRemovalIds.size;

  useEffect(() => {
    if (!data.ordersHasMore) return;
    const sentinel = loadMoreSentinelRef.current;
    const root = listScrollRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          data.loadMoreOrders();
        }
      },
      { root, rootMargin: '160px', threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
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
    <div className="flex items-center gap-1.5 [&_.exp-period-filter-btn]:inline-flex [&_.exp-period-filter-btn]:shrink-0 [&_.exp-period-filter-btn]:items-center [&_.exp-period-filter-btn]:justify-center [&_.exp-period-filter-btn]:gap-1.5 [&_.exp-period-filter-btn]:rounded-lg [&_.exp-period-filter-btn]:border [&_.exp-period-filter-btn]:border-white/20 [&_.exp-period-filter-btn]:bg-transparent [&_.exp-period-filter-btn]:px-3 [&_.exp-period-filter-btn]:py-1.5 [&_.exp-period-filter-btn]:text-sm [&_.exp-period-filter-btn]:font-medium [&_.exp-period-filter-btn]:text-[var(--text-primary)] [&_.exp-period-filter-btn:hover]:bg-white/5 [&_.exp-period-filter-btn--active]:border-transparent [&_.exp-period-filter-btn--active]:bg-blue-600 [&_.exp-period-filter-btn--active]:font-semibold [&_.exp-period-filter-btn--active]:text-white [&_.exp-period-filter-btn--active]:hover:bg-blue-500">
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
    </div>
  );

  const filtersButton = (
    <button
      type="button"
      className={`${HEADER_BTN_SECONDARY} ${filtersOpen ? 'bg-white/5' : ''}`}
      onClick={() => setFiltersOpen((v) => !v)}
    >
      <Filter className="h-4 w-4" aria-hidden />
      Filtros
      {filterBadges.length > 0 ? (
        <span className="exp-queue-header-btn-count">{filterBadges.length}</span>
      ) : null}
    </button>
  );

  const refreshButton = onRefresh ? (
    <button
      type="button"
      className={`${HEADER_BTN_SECONDARY} !px-2`}
      onClick={onRefresh}
      aria-label="Atualizar fila"
    >
      <RefreshCw className={`h-4 w-4 ${data.ordersLoading ? 'animate-spin' : ''}`} />
    </button>
  ) : null;

  return (
    <aside className="exp-queue-panel flex h-full min-h-0 flex-1 flex-col">
      <div className="exp-queue-panel-header shrink-0 border-b border-[var(--exp-border)] !px-2 !py-1.5">
        {isPedidosMode ? (
          <ErpFilterBar<ExpeditionPedidosPreset>
            storageKey={pedidosFiltersKey}
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
            onSaveFilter={() => setNewFilterOpen(true)}
            onApplyPreset={(preset) => {
              applyPedidosPreset(
                preset,
                data,
                onSourceFilterChange,
                null,
                setActiveCustomFilterId,
              );
            }}
            leadingToolbar={
              <div className="mb-1.5 flex w-full basis-full items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto erp-scrollbar">
                  {filtersButton}
                  {periodFilterNode}
                </div>
                {refreshButton ? <div className="shrink-0">{refreshButton}</div> : null}
              </div>
            }
            searchSlot={
              <div className="flex w-full flex-col gap-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <div className="exp-queue-search-wrap erp-filter-search-slot min-w-[10rem] flex-1">
                    <Search className="exp-queue-search-icon" aria-hidden />
                    <input
                      type="search"
                      value={data.appliedFilters.search}
                      onChange={(e) => {
                        data.setPage(1);
                        setActiveCustomFilterId(null);
                        data.setAppliedFilters((f) => ({ ...f, search: e.target.value }));
                      }}
                      placeholder="Número do pedido..."
                      className="exp-queue-search"
                    />
                  </div>
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
                    className="h-9 min-w-[9.5rem] shrink-0 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
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
                    <>
                      <div className="exp-queue-search-wrap erp-filter-search-slot min-w-[10rem] flex-1">
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
                          className="exp-queue-search !pl-3"
                          aria-label={`Valor do filtro ${pedidosFieldFilterLabel(data.appliedFilters.filterField)}`}
                        />
                      </div>
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
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
                        aria-label="Limpar filtro selecionado"
                        title="Limpar filtro"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </>
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
            }
          >
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  Status
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HEADER_STATUS_FILTERS.map((f) => {
                    const on = data.statusFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleStatusFilterChange(f.id)}
                        className={on ? STATUS_PILL_ACTIVE : STATUS_PILL_INACTIVE}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Busque por pedido, cliente ou SKU. Filtros salvos aparecem abaixo.
              </p>
            </div>
          </ErpFilterBar>
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

      {isPedidosMode ? (
        <div className="exp-queue-print-toolbar shrink-0">
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
      )}

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
        className="exp-queue-panel-list erp-scrollbar min-h-0 flex-1 overflow-y-auto !p-2 !pb-4"
      >
        {data.ordersLoading && data.orders.length === 0 ? (
          <div className="exp-queue-empty p-2">
            <CardGridSkeleton count={6} />
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
          <>
            <div className="grid w-full grid-cols-1 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4">
              {data.orders.map(renderOrderCard)}
            </div>
            {data.ordersHasMore ? (
              <div ref={loadMoreSentinelRef} className="exp-queue-load-more-sentinel" />
            ) : null}
            {data.ordersLoadingMore ? (
              <InlineLoadMoreSkeleton label="Carregando mais pedidos" />
            ) : null}
          </>
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
    </aside>
  );
}
