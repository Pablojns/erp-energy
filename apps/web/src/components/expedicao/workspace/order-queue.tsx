'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
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

  const selectedForPrintCount = selectedForPrintIds.size;
  const selectedForRemovalCount = selectedForRemovalIds.size;

  useEffect(() => {
    if (!isPedidosMode || !data.ordersHasMore) return;
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

  return (
    <aside className="exp-queue-panel flex h-full min-h-0 flex-1 flex-col">
      <div className="exp-queue-panel-header shrink-0 border-b border-[var(--exp-border)] !px-2 !py-1.5">
        <div className="exp-queue-header-row !mb-1.5 !gap-2">
          <h2 className="exp-queue-panel-title text-sm">{title}</h2>
          <div className="exp-queue-header-actions !gap-2">
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
                className="exp-queue-header-btn exp-queue-header-btn--icon !h-8 !w-8 !px-2.5 !py-1.5 !text-xs"
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
                className={`exp-queue-header-btn !h-auto !px-2.5 !py-1.5 !text-xs ${filtersOpen ? 'exp-queue-header-btn--open' : ''}`}
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Filter className="h-4 w-4" aria-hidden />
                Filtros
                {filterBadges.length > 0 ? (
                  <span className="exp-queue-header-btn-count">{filterBadges.length}</span>
                ) : null}
              </button>
            ) : null}
            {onImportWeg ? (
              <button
                type="button"
                className="exp-queue-header-btn !h-auto !px-2.5 !py-1.5 !text-xs"
                onClick={onImportWeg}
              >
                Importar WEG
              </button>
            ) : null}
            {onNewOrder ? (
              <button
                type="button"
                className="exp-queue-header-btn exp-queue-header-btn--primary !h-auto !px-2.5 !py-1.5 !text-xs"
                onClick={onNewOrder}
              >
                + Novo Pedido
              </button>
            ) : null}
            {onNewSiteOrder ? (
              <button
                type="button"
                className="exp-queue-header-btn exp-queue-header-btn--primary !h-auto !px-2.5 !py-1.5 !text-xs"
                onClick={onNewSiteOrder}
              >
                Novo Pedido Site
              </button>
            ) : null}
            {onNewVendaExterna ? (
              <button
                type="button"
                className="exp-queue-header-btn exp-queue-header-btn--primary !h-auto !px-2.5 !py-1.5 !text-xs"
                onClick={onNewVendaExterna}
              >
                Nova Venda Externa
              </button>
            ) : null}
          </div>
        </div>

        {isPedidosMode && sourceFilter && onSourceFilterChange ? (
          <div className="mt-1.5 flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => onSourceFilterChange('WEG')}
              className={
                sourceFilter === 'WEG'
                  ? 'relative rounded-lg border border-blue-400/30 bg-gradient-to-r from-blue-600 to-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                  : 'relative rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-zinc-400 transition-all duration-150 hover:border-white/20 hover:text-zinc-200'
              }
            >
              WEG
            </button>
            <button
              type="button"
              onClick={() => onSourceFilterChange('SITE')}
              className={
                sourceFilter === 'SITE'
                  ? 'relative rounded-lg border border-blue-400/30 bg-gradient-to-r from-blue-600 to-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                  : 'relative rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-zinc-400 transition-all duration-150 hover:border-white/20 hover:text-zinc-200'
              }
            >
              Site
            </button>
            <button
              type="button"
              onClick={() => onSourceFilterChange('VENDA_EXTERNA')}
              className={
                sourceFilter === 'VENDA_EXTERNA'
                  ? 'relative rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-600 to-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(217,119,6,0.4)]'
                  : 'relative rounded-lg border border-white/10 bg-transparent px-2.5 py-1.5 text-xs font-semibold text-zinc-400 transition-all duration-150 hover:border-white/20 hover:text-zinc-200'
              }
            >
              Venda Externa
            </button>
          </div>
        ) : null}

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
          <div className="exp-queue-empty">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            <p>Carregando pedidos…</p>
          </div>
        ) : data.orders.length === 0 ? (
          <p className="exp-queue-empty">Nenhum pedido neste filtro.</p>
        ) : isPedidosMode ? (
          <>
            <div className="grid w-full grid-cols-1 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4">
              {data.orders.map(renderOrderCard)}
            </div>
            {data.ordersHasMore ? (
              <div ref={loadMoreSentinelRef} className="exp-queue-load-more-sentinel" />
            ) : null}
            {data.ordersLoadingMore ? (
              <div className="exp-queue-load-more">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
                <span>Carregando mais pedidos…</span>
              </div>
            ) : null}
          </>
        ) : separationSections ? (
          <div className="exp-queue-sections gap-2">
            {separationSections.map((section) => (
              <section key={section.id} className="exp-queue-section">
                <h3 className="exp-queue-section-title">{section.label}</h3>
                {section.orders.length === 0 ? (
                  <p className="exp-queue-section-empty">Nenhum pedido nesta etapa.</p>
                ) : (
                  <div className="grid w-full grid-cols-1 gap-1.5 lg:grid-cols-3 2xl:grid-cols-4">
                    {section.orders.map(renderOrderCard)}
                  </div>
                )}
              </section>
            ))}
          </div>
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
