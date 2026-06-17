'use client';

/**
 * Ponte entre os hooks de /api/pedidos e a interface esperada pelos componentes
 * da Expedição (OrderQueue, SeparationWorkbench).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_FILTERS } from '@/src/components/expedicao/shared/constants';
import type {
  BannerState,
  ExpeditionKpiStrip,
  ExpeditionSummary,
  FilterFormState,
  OrderDto,
  OrderStatus,
  PaginatedOrders,
  StatusFilterId,
  ToastState,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder } from '@/src/services/api/pedidos-normalize';
import {
  quickFilterToStatus,
  statusFilterToQuick,
  type QueueQuickFilterId,
} from '@/src/components/expedicao/workspace/queue-quick-filters';
import { usePedidoDetalhe } from '@/src/hooks/usePedidoDetalhe';
import { usePedidos } from '@/src/hooks/usePedidos';
import type { UseExpeditionOrdersOptions } from '@/src/components/expedicao/shared/use-expedition-orders';

export function useExpeditionPedidosBridge(opts: UseExpeditionOrdersOptions = {}) {
  const mode = opts.mode ?? 'expedition';
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>(
    opts.initialStatusFilter ?? 'all',
  );
  const [separationSubFilter, setSeparationSubFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterFormState>(INITIAL_FILTERS);
  const [searchDebounced, setSearchDebounced] = useState('');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reservingOrderId, setReservingOrderId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [sum, setSum] = useState<ExpeditionSummary | null>(null);
  const [sumLoading, setSumLoading] = useState(true);
  const [kpiStrip, setKpiStrip] = useState<ExpeditionKpiStrip | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  const quickFilter: QueueQuickFilterId = statusFilterToQuick(statusFilter);

  const {
    pedidos: fetchedOrders,
    loading: ordersLoading,
    error: pedidosError,
    meta,
    refetch: refetchPedidos,
  } = usePedidos({
    statusFilter,
    quickFilter,
    search: searchDebounced,
    appliedFilters,
    page,
    pageSize: 25,
  });

  const orders = useMemo(() => {
    if (mode === 'separation') {
      return fetchedOrders.filter((o) =>
        o.status === 'EM_SEPARACAO' ||
        o.status === 'SEPARADO' ||
        o.status === 'AGUARDANDO_NF' ||
        o.status === 'NF_ATRELADA',
      );
    }
    return fetchedOrders.filter((o) => o.status !== 'EM_SEPARACAO');
  }, [fetchedOrders, mode]);

  useEffect(() => {
    if (pedidosError) {
      setBanner({ variant: 'error', message: pedidosError });
    }
  }, [pedidosError]);

  useEffect(() => {
    const t = setTimeout(
      () => setSearchDebounced(appliedFilters.search.trim()),
      360,
    );
    return () => clearTimeout(t);
  }, [appliedFilters.search]);

  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const res = await erpFetchJson<ExpeditionSummary>('orders/summary');
      setSum(res);
    } catch {
      setSum(null);
    } finally {
      setSumLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), refetchPedidos()]);
  }, [loadSummary, refetchPedidos]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!sum) {
      setKpiStrip(null);
      return;
    }
    setKpiStrip({
      pedidosHoje: sum.totalPedidos,
      urgentes: sum.urgentes,
      emSeparacao: sum.emSeparacao,
      parciais: 0,
      comFalta: sum.rupturaPedidos ?? 0,
      aguardandoNf: sum.aguardandoNf,
      saidasHoje: 0,
      reservados: sum.reservados,
    });
    setKpiLoading(false);
  }, [sum]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.durationMs ?? 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function reserveOrder(id: string) {
    setReservingOrderId(id);
    try {
      await erpFetchJson(`orders/${id}/reserve`, { method: 'POST' });
      await refreshAll();
      setToast({
        variant: 'ok',
        message: 'Reserva aplicada — parcial ou completa conforme estoque.',
      });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao reservar.',
      });
    } finally {
      setReservingOrderId(null);
    }
  }

  async function sendToPicking(id: string) {
    try {
      await erpFetchJson(`orders/${id}/send-to-picking`, { method: 'POST' });
      await refreshAll();
      setToast({ variant: 'ok', message: 'Pedido enviado para separação.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message:
          e instanceof Error ? e.message : 'Falha ao enviar para separação.',
      });
    }
  }

  async function markPicked(id: string) {
    const order = orders.find((o) => o.id === id);
    const numero = order ? numeroPedFromOrder(order) : null;
    try {
      if (!numero) {
        await erpFetchJson(`orders/${id}/mark-picked`, { method: 'POST' });
      } else {
        await erpFetchJson(`api/pedidos/${numero}/separacao/concluir`, {
          method: 'POST',
        });
      }
      await refreshAll();
      setToast({ variant: 'ok', message: 'Lote de separação concluído.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao concluir separação.',
      });
    }
  }

  async function attachInvoiceOrder(id: string, invoiceNumber: string) {
    const order = orders.find((o) => o.id === id);
    const numero = order ? numeroPedFromOrder(order) : null;
    const nf = invoiceNumber.trim();
    if (!nf) return false;
    try {
      if (numero) {
        await erpFetchJson(`api/pedidos/${numero}/nf`, {
          method: 'POST',
          body: JSON.stringify({ invoiceNumber: nf }),
        });
      } else {
        await erpFetchJson(`orders/${id}/generate-exit`, {
          method: 'POST',
          body: JSON.stringify({ invoiceNumber: nf }),
        });
      }
      await refreshAll();
      window.dispatchEvent(new Event('expedition-refresh'));
      setToast({ variant: 'ok', message: 'NF-e vinculada com sucesso!' });
      return true;
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao gerar NF-e.',
      });
      return false;
    }
  }

  async function saveSeparationProgress(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    const numero = order ? numeroPedFromOrder(order) : null;
    try {
      if (numero) {
        await erpFetchJson(`api/pedidos/${numero}/separacao/salvar`, {
          method: 'PATCH',
        });
      }
      await refreshAll();
      setToast({
        variant: 'ok',
        message: 'Progresso salvo ✓',
        durationMs: 2000,
      });
      return true;
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao salvar progresso.',
      });
      return false;
    }
  }

  async function concludeSeparation(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    const numero = order ? numeroPedFromOrder(order) : null;
    try {
      if (numero) {
        await erpFetchJson(`api/pedidos/${numero}/separacao/concluir`, {
          method: 'POST',
        });
      } else {
        await erpFetchJson(`orders/${orderId}/mark-picked`, { method: 'POST' });
      }
      await refreshAll();
      return true;
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao concluir separação.',
      });
      return false;
    }
  }

  async function finalizeExpeditionOrder(id: string) {
    try {
      await erpFetchJson(`orders/${id}/finalize-expedition`, { method: 'POST' });
      await refreshAll();
      setToast({ variant: 'ok', message: 'Saída registrada — estoque baixado.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message:
          e instanceof Error ? e.message : 'Falha ao finalizar expedição.',
      });
    }
  }

  async function toggleOrderUrgent(order: OrderDto) {
    try {
      const next = order.priority <= 2 ? 4 : 2;
      await erpFetchJson(`orders/${order.id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: next }),
      });
      await refreshAll();
      setToast({
        variant: 'ok',
        message: next <= 2 ? 'Marcado como urgente.' : 'Prioridade normal.',
      });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha na prioridade.',
      });
    }
  }

  async function markLineSeparated(
    orderId: string,
    itemId: string,
    qtyLine: number,
  ) {
    const order = orders.find((o) => o.id === orderId);
    const item = order?.items.find((i) => i.id === itemId);
    const numero = order ? numeroPedFromOrder(order) : null;
    try {
      if (numero && item) {
        const qty = Math.max(0, Math.min(qtyLine, item.quantity));
        const status_item =
          qty === 0 ? 'pendente' : qty >= item.quantity ? 'completo' : 'parcial';
        await erpFetchJson(`api/pedidos/${numero}/itens/${item.lineNumber}`, {
          method: 'PATCH',
          body: JSON.stringify({
            quantidade_separada: qty,
            status_item,
          }),
        });
      } else {
        await erpFetchJson(`orders/${orderId}/items/${itemId}/picked-qty`, {
          method: 'PATCH',
          body: JSON.stringify({ pickedQty: qtyLine }),
        });
      }
      await refreshAll();
      setToast({ variant: 'ok', message: 'Item confirmado.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao confirmar item.',
      });
    }
  }

  async function markAllSeparatedFromReserved(orderId: string) {
    const o = orders.find((x) => x.id === orderId);
    if (!o) return;
    const numero = numeroPedFromOrder(o);
    try {
      if (numero) {
        await erpFetchJson(`api/pedidos/${numero}/separacao/concluir`, {
          method: 'POST',
        });
      } else if (o.status === 'EM_SEPARACAO') {
        for (const it of o.items) {
          const target = Math.min(it.reservedQuantity, it.quantity);
          await erpFetchJson(`orders/${orderId}/items/${it.id}/picked-qty`, {
            method: 'PATCH',
            body: JSON.stringify({ pickedQty: target }),
          });
        }
      } else {
        setToast({ variant: 'err', message: 'Pedido deve estar em separação.' });
        return;
      }
      await refreshAll();
      setToast({ variant: 'ok', message: 'Lote de separação concluído.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha em lote.',
      });
    }
  }

  async function patchOrderStatus(id: string, status: OrderStatus) {
    try {
      await erpFetchJson(`orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await refreshAll();
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao atualizar status.',
      });
    }
  }

  function confirmCancelOrder(order: OrderDto) {
    const label = order.externalOrderNumber ?? order.code;
    if (
      !window.confirm(
        `Cancelar o pedido ${label}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    void patchOrderStatus(order.id, 'CANCELADO');
  }

  const filterCounts = useMemo(() => {
    if (!sum) return {} as Partial<Record<StatusFilterId, number>>;
    return {
      all: sum.totalPedidos,
      urgente: sum.urgentes,
      aguardando_nf: sum.aguardandoNf,
      em_separacao: sum.emSeparacao,
      aguardando_estoque: sum.rupturaPedidos ?? 0,
      pronto_separacao: sum.reservados,
    } as Partial<Record<StatusFilterId, number>>;
  }, [sum]);

  return {
    mode,
    statusFilter,
    setStatusFilter,
    separationSubFilter,
    setSeparationSubFilter,
    expandedOrderId,
    setExpandedOrderId,
    kpiStrip,
    kpiLoading,
    sum,
    sumLoading,
    orders,
    meta,
    ordersLoading,
    banner,
    setBanner,
    toast,
    setToast,
    reservingOrderId,
    page,
    setPage,
    appliedFilters,
    setAppliedFilters,
    filterCounts,
    refreshAll,
    reserveOrder,
    sendToPicking,
    markPicked,
    attachInvoiceOrder,
    finalizeExpeditionOrder,
    toggleOrderUrgent,
    markLineSeparated,
    markAllSeparatedFromReserved,
    saveSeparationProgress,
    concludeSeparation,
    patchOrderStatus,
    confirmCancelOrder,
  };
}

/** Detalhe do pedido selecionado (por número externo). */
export function useExpeditionSelectedPedido(
  selectedOrder: OrderDto | null,
  onRefetchList: () => void,
) {
  const numero = selectedOrder?.externalOrderNumber ?? null;
  const { pedido, loading, error, refetch } = usePedidoDetalhe(numero);

  const displayOrder = pedido ?? selectedOrder;

  const refetchAll = useCallback(async () => {
    await Promise.all([onRefetchList(), refetch()]);
  }, [onRefetchList, refetch]);

  return { displayOrder, detailLoading: loading, detailError: error, refetchDetail: refetchAll };
}
