'use client';

/**
 * Ponte entre os hooks de /api/pedidos e a interface esperada pelos componentes
 * da Expedição (OrderQueue, SeparationWorkbench).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { INITIAL_FILTERS } from '@/src/components/expedicao/shared/constants';
import type {
  BannerState,
  ExpeditionSummary,
  FilterFormState,
  OrderDto,
  OrderStatus,
  StatusFilterId,
  ToastState,
  UseExpeditionOrdersOptions,
} from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';
import { usePedidoDetalhe } from '@/src/hooks/usePedidoDetalhe';
import { usePedidos } from '@/src/hooks/usePedidos';

function isAguardandoNfSeparationStatus(status: string): boolean {
  return (
    status === 'SEPARADO' ||
    status === 'AGUARDANDO_NF' ||
    status === 'NF_ATRELADA'
  );
}

export function useExpeditionPedidosBridge(opts: UseExpeditionOrdersOptions = {}) {
  const mode = opts.mode ?? 'expedition';
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>(
    opts.initialStatusFilter ?? 'all',
  );
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterFormState>(INITIAL_FILTERS);
  const [searchDebounced, setSearchDebounced] = useState('');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sum, setSum] = useState<ExpeditionSummary | null>(null);
  const [sumLoading, setSumLoading] = useState(true);

  const infiniteScroll = mode === 'expedition';

  const {
    pedidos: fetchedOrders,
    loading: ordersLoading,
    loadingMore: ordersLoadingMore,
    hasMore: ordersHasMore,
    error: pedidosError,
    meta,
    refetch: refetchPedidos,
  } = usePedidos({
    statusFilter,
    search: searchDebounced,
    appliedFilters,
    page,
    pageSize: 25,
    mode,
    infinite: infiniteScroll,
  });

  const loadMoreOrders = useCallback(() => {
    if (!infiniteScroll || ordersLoading || ordersLoadingMore) return;
    if (!meta || page >= meta.totalPages) return;
    setPage((p) => p + 1);
  }, [
    infiniteScroll,
    ordersLoading,
    ordersLoadingMore,
    meta,
    page,
  ]);

  const orders = useMemo(() => {
    if (mode === 'separation') {
      return fetchedOrders.filter(
        (o) =>
          o.status === 'EM_SEPARACAO' || isAguardandoNfSeparationStatus(o.status),
      );
    }
    return fetchedOrders;
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

  const refetchFromStart = useCallback(async () => {
    setPage(1);
    await Promise.all([loadSummary(), refetchPedidos()]);
  }, [loadSummary, refetchPedidos]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.durationMs ?? 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function reserveOrder(id: string) {
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
        await erpFetchJson(pedidoApiUrl(numero, 'separacao', 'concluir'), {
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

  async function attachRemessaExit(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    const numero = order ? numeroPedFromOrder(order) : null;
    if (!numero) {
      setToast({
        variant: 'err',
        message: 'Pedido sem número para registrar saída.',
      });
      return false;
    }
    try {
      await erpFetchJson(pedidoApiUrl(numero, 'saida'), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshAll();
      window.dispatchEvent(new Event('expedition-refresh'));
      setToast({ variant: 'ok', message: 'Saída registrada com nota de remessa.' });
      return true;
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao registrar saída.',
      });
      return false;
    }
  }

  async function attachInvoiceOrder(id: string, invoiceNumber: string) {
    const order = orders.find((o) => o.id === id);
    const numero = order ? numeroPedFromOrder(order) : null;
    const nf = invoiceNumber.trim();
    if (!nf) return false;
    try {
      if (numero) {
        await erpFetchJson(pedidoApiUrl(numero, 'nf'), {
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
        await erpFetchJson(pedidoApiUrl(numero, 'separacao', 'salvar'), {
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
        await erpFetchJson(pedidoApiUrl(numero, 'separacao', 'concluir'), {
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
      const numero = numeroPedFromOrder(order);
      const path = numero
        ? pedidoApiUrl(numero, 'priority')
        : `orders/${order.id}/priority`;
      await erpFetchJson(path, {
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
        await erpFetchJson(pedidoApiUrl(numero, 'itens', String(item.lineNumber)), {
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
        await erpFetchJson(pedidoApiUrl(numero, 'separacao', 'concluir'), {
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

  async function removeOrdersFromSeparation(targetOrders: OrderDto[]) {
    if (targetOrders.length === 0) return false;
    try {
      for (const order of targetOrders) {
        const numero = numeroPedFromOrder(order);
        if (numero) {
          await erpFetchJson(pedidoApiUrl(numero, 'status'), {
            method: 'PATCH',
            body: JSON.stringify({ status: 'NOVO' }),
          });
        } else {
          await erpFetchJson(`orders/${order.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'NOVO' }),
          });
        }
      }
      await refreshAll();
      setToast({
        variant: 'ok',
        message: `${targetOrders.length} pedido(s) removido(s) da separação.`,
      });
      return true;
    } catch (e) {
      setToast({
        variant: 'err',
        message:
          e instanceof Error ? e.message : 'Falha ao remover da separação.',
      });
      return false;
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

  async function patchOrderCarrier(order: OrderDto, carrierId: string | null) {
    const numero = order.externalOrderNumber?.trim();
    if (!numero) {
      setToast({
        variant: 'err',
        message: 'Pedido sem número para atualizar transportadora.',
      });
      return;
    }
    try {
      await erpFetchJson(pedidoApiUrl(numero, 'carrier'), {
        method: 'PATCH',
        body: JSON.stringify({ carrierId }),
      });
      setToast({
        variant: 'ok',
        message: 'Transportadora atualizada.',
      });
      await refreshAll();
    } catch (e) {
      setToast({
        variant: 'err',
        message:
          e instanceof Error ? e.message : 'Falha ao atualizar transportadora.',
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
    sum,
    sumLoading,
    orders,
    meta,
    ordersLoading,
    ordersLoadingMore,
    ordersHasMore,
    loadMoreOrders,
    banner,
    toast,
    setToast,
    page,
    setPage,
    appliedFilters,
    setAppliedFilters,
    filterCounts,
    refreshAll,
    refetchFromStart,
    reserveOrder,
    sendToPicking,
    markPicked,
    attachInvoiceOrder,
    attachRemessaExit,
    finalizeExpeditionOrder,
    toggleOrderUrgent,
    markLineSeparated,
    markAllSeparatedFromReserved,
    saveSeparationProgress,
    concludeSeparation,
    patchOrderStatus,
    patchOrderCarrier,
    removeOrdersFromSeparation,
    confirmCancelOrder,
  };
}

/** Mescla campos de workflow da fila (sempre atualizada) sobre o cache de detalhe. */
function mergeListOrderIntoDetail(pedido: OrderDto, fromList: OrderDto): OrderDto {
  return {
    ...pedido,
    status: fromList.status,
    priority: fromList.priority,
    volumes: fromList.volumes,
    notaRemessa: fromList.notaRemessa,
    notaRemessaConfirmada: fromList.notaRemessaConfirmada,
    carrierId: fromList.carrierId,
    carrierName: fromList.carrierName,
    invoiceNumber: fromList.invoiceNumber,
    invoiceStatus: fromList.invoiceStatus,
    mercadoEletronicoStatus: fromList.mercadoEletronicoStatus,
    contaAzulStatus: fromList.contaAzulStatus,
    physicalReservationActive: fromList.physicalReservationActive,
    stockReserveBlocked: fromList.stockReserveBlocked,
    updatedAt: fromList.updatedAt,
  };
}

/** Detalhe do pedido selecionado (por número externo). */
export function useExpeditionSelectedPedido(
  selectedOrder: OrderDto | null,
  onRefetchList: () => void,
) {
  const numero = selectedOrder?.externalOrderNumber ?? null;
  const { pedido, loading, error, refetch } = usePedidoDetalhe(numero);

  const displayOrder = useMemo(() => {
    if (!selectedOrder) return null;
    if (!pedido) return selectedOrder;
    return mergeListOrderIntoDetail(pedido, selectedOrder);
  }, [pedido, selectedOrder]);

  const refetchAll = useCallback(async () => {
    await Promise.all([onRefetchList(), refetch()]);
  }, [onRefetchList, refetch]);

  return { displayOrder, detailLoading: loading, detailError: error, refetchDetail: refetchAll };
}
