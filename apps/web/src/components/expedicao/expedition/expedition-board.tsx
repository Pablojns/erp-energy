'use client';

import { ExpeditionFilters } from '@/src/components/expedicao/expedition/expedition-filters';
import { ExpeditionHeader } from '@/src/components/expedicao/expedition/expedition-header';
import { ExpeditionKpis } from '@/src/components/expedicao/expedition/expedition-kpis';
import { ExpeditionSearch } from '@/src/components/expedicao/expedition/expedition-search';
import { ExpeditionOrdersBoard } from '@/src/components/expedicao/expedition-orders-board';
import { STATUS_FILTERS } from '@/src/components/expedicao/shared/constants';
import { countActiveFilters } from '@/src/components/expedicao/shared/constants';
import type { useExpeditionOrders } from '@/src/components/expedicao/shared/use-expedition-orders';

export type ExpeditionOrdersData = ReturnType<typeof useExpeditionOrders>;

export type ExpeditionBoardChromeProps = {
  data: ExpeditionOrdersData;
  onOpenFilters: () => void;
  onNewOrder: () => void;
  onNewWeg: () => void;
  onImportWeg?: () => void;
};

export function ExpeditionBoardChrome(props: ExpeditionBoardChromeProps) {
  const { data, onOpenFilters, onNewOrder, onNewWeg, onImportWeg } = props;
  const activeDef = STATUS_FILTERS.find((f) => f.id === data.statusFilter);

  return (
    <div className="erp-expedition-page space-y-8">
      <ExpeditionHeader
        onRefresh={() => void data.refreshAll()}
        refreshing={data.ordersLoading || data.sumLoading}
        onOpenFilters={onOpenFilters}
        filterCount={countActiveFilters(data.appliedFilters)}
        onNewOrder={onNewOrder}
        onNewWeg={onNewWeg}
        onImportWeg={onImportWeg ?? onNewWeg}
      />

      <ExpeditionSearch
        value={data.appliedFilters.search}
        onChange={(search) =>
          data.setAppliedFilters((f) => ({ ...f, search }))
        }
      />

      <ExpeditionFilters
        active={data.statusFilter}
        onChange={data.setStatusFilter}
        counts={data.filterCounts}
        hint={activeDef?.hint}
      />

      <ExpeditionKpis strip={data.kpiStrip} loading={data.kpiLoading} />

      {data.banner ? (
        <div
          role="status"
          className={`rounded-xl px-4 py-2.5 text-sm ${
            data.banner.variant === 'success'
              ? 'erp-alert-success'
              : 'erp-alert-error'
          }`}
        >
          {data.banner.message}
        </div>
      ) : null}

      {data.toast ? (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[200] max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ${
            data.toast.variant === 'ok' ? 'erp-alert-success' : 'erp-alert-error'
          }`}
        >
          {data.toast.message}
        </div>
      ) : null}

      <ExpeditionOrdersBoard
        mode="expedition"
        listTitle="Lista de pedidos"
        orders={data.orders}
        ordersLoading={data.ordersLoading}
        meta={data.meta}
        page={data.page}
        setPage={data.setPage}
        expandedOrderId={data.expandedOrderId}
        setExpandedOrderId={data.setExpandedOrderId}
        reservingOrderId={data.reservingOrderId}
        reserveOrder={data.reserveOrder}
        sendToPicking={data.sendToPicking}
        markPicked={data.markPicked}
        attachInvoiceOrder={data.attachInvoiceOrder}
        finalizeExpeditionOrder={data.finalizeExpeditionOrder}
        confirmCancelOrder={data.confirmCancelOrder}
        patchOrderStatus={data.patchOrderStatus}
        toggleOrderUrgent={data.toggleOrderUrgent}
        markLineSeparated={data.markLineSeparated}
        markAllSeparatedFromReserved={data.markAllSeparatedFromReserved}
        refreshAll={data.refreshAll}
        onToast={data.setToast}
      />
    </div>
  );
}
