'use client';

import { CheckCircle2, Filter, RefreshCw } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { ExpeditionHeader } from '@/src/components/expedicao/expedition/expedition-header';
import { ExpeditionSearch } from '@/src/components/expedicao/expedition/expedition-search';
import { ExpeditionOrdersBoard } from '@/src/components/expedicao/expedition-orders-board';
import { SEPARATION_FILTERS } from '@/src/components/expedicao/shared/constants';
import { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';

export function SeparationBoard() {
  const data = useExpeditionPedidosBridge({
    mode: 'separation',
    initialStatusFilter: 'all',
  });

  return (
    <div className="erp-expedition-page space-y-8">
      <ExpeditionHeader
        title="Separação"
        subtitle="Piso de separação — controle de quantidade por item, parcial permitido mesmo com falta de estoque."
        showWegActions={false}
        onRefresh={() => void data.refreshAll()}
        refreshing={data.ordersLoading}
        onOpenFilters={() => {}}
        filterCount={0}
      />

      <div className="flex flex-wrap items-center gap-2">
        <GlowButton
          variant="secondary"
          type="button"
          className="gap-2"
          disabled={data.ordersLoading}
          onClick={() => void data.refreshAll()}
        >
          <RefreshCw
            className={`h-4 w-4 ${data.ordersLoading ? 'animate-spin' : ''}`}
          />
          Atualizar
        </GlowButton>
        <GlowButton
          variant="primary"
          type="button"
          className="gap-2 font-semibold"
          onClick={() => {
            const first = data.orders[0];
            if (first) void data.markAllSeparatedFromReserved(first.id);
          }}
        >
          <CheckCircle2 className="h-4 w-4" />
          Concluir separação em lote
        </GlowButton>
        <button type="button" className="erp-filter-chip-btn min-h-[44px]">
          <Filter className="h-4 w-4" />
          Filtros
        </button>
      </div>

      <ExpeditionSearch
        value={data.appliedFilters.search}
        onChange={(search) =>
          data.setAppliedFilters((f) => ({ ...f, search }))
        }
        placeholder="Buscar pedido, SKU, recebedor, ponto de descarga…"
      />

      <div className="erp-scrollbar flex flex-wrap gap-2">
        {SEPARATION_FILTERS.map((f) => {
          const Icon = f.icon;
          const on = data.separationSubFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              className="erp-tab-pill"
              data-active={on ? 'true' : 'false'}
              onClick={() => data.setSeparationSubFilter(f.id)}
            >
              <Icon className="h-4 w-4" />
              {f.label}
            </button>
          );
        })}
      </div>

      {data.toast ? (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-[200] rounded-xl px-4 py-3 text-sm ${
            data.toast.variant === 'ok' ? 'erp-alert-success' : 'erp-alert-error'
          }`}
        >
          {data.toast.message}
        </div>
      ) : null}

      <ExpeditionOrdersBoard
        mode="separation"
        listTitle={`Pedidos em separação${data.meta ? ` (${data.meta.total})` : ''}`}
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
        attachInvoiceOrder={(id) => {
          const nf = window.prompt('Informe o número da NF-e');
          if (!nf) return;
          void data.attachInvoiceOrder(id, nf);
        }}
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
