'use client';

/**
 * Ponte entre os hooks de /api/pedidos e a interface esperada pelos componentes
 * da Expedição (OrderQueue, SeparationWorkbench).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_FILTERS } from '@/src/components/expedicao/shared/constants';
import type {
  BannerState,
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
import {
  DEFAULT_PEDIDOS_SORT_BY,
  DEFAULT_PEDIDOS_SORT_ORDER,
  type PedidosSortOrder,
} from '@/src/components/expedicao/workspace/pedidos-saved-filter-types';
import { useBusinessContext } from '@/src/components/layout/business-context-provider';

export function useExpeditionPedidosBridge(opts: UseExpeditionOrdersOptions = {}) {
  const mode = opts.mode ?? 'expedition';
  const { context: businessContext, orderSource } = useBusinessContext();
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>(
    opts.initialStatusFilter ?? 'all',
  );
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState<FilterFormState>(() => ({
    ...INITIAL_FILTERS,
    source: opts.initialOrderSource ?? INITIAL_FILTERS.source,
    search: opts.initialSearch?.trim() ?? INITIAL_FILTERS.search,
  }));
  const [searchDebounced, setSearchDebounced] = useState(
    () => opts.initialSearch?.trim() ?? '',
  );
  const [sortBy, setSortBy] = useState(
    mode === 'separation' ? 'sentToSeparationAt' : DEFAULT_PEDIDOS_SORT_BY,
  );
  const [sortOrder, setSortOrder] = useState<PedidosSortOrder>(
    mode === 'separation' ? 'asc' : DEFAULT_PEDIDOS_SORT_ORDER,
  );
  const [filterValueDebounced, setFilterValueDebounced] = useState('');
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshQueuedRef = useRef(false);

  // Separação precisa carregar além da 1ª página: pedidos EM_SEPARACAO podem ficar
  // atrás de SEPARADO/AGUARDANDO_NF quando ordenados por orderDate desc.
  const infiniteScroll = true;

  // Sincroniza source com o contexto: WEG/SITE forçam; Todos libera (source=all).
  useEffect(() => {
    if (businessContext === 'ALL') {
      setAppliedFilters((prev) =>
        prev.source === 'all' ? prev : { ...prev, source: 'all' },
      );
      setPage(1);
      return;
    }
    setAppliedFilters((prev) => {
      const nextSource = orderSource as FilterFormState['source'];
      if (prev.source === nextSource) return prev;
      return { ...prev, source: nextSource };
    });
    setPage(1);
  }, [businessContext, orderSource]);

  const appliedFiltersForApi = useMemo(
    () => ({
      ...appliedFilters,
      filterValue: filterValueDebounced,
      // Em Todos, respeita source local (all no início; chips depois).
      // Em WEG/SITE, força o source do contexto.
      source:
        businessContext === 'ALL'
          ? appliedFilters.source
          : (orderSource as FilterFormState['source']),
    }),
    [appliedFilters, filterValueDebounced, orderSource, businessContext],
  );

  const resetPageToFirst = useCallback(() => {
    setPage((p) => (p === 1 ? p : 1));
  }, []);

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
    appliedFilters: appliedFiltersForApi,
    page,
    pageSize: 30,
    mode,
    infinite: infiniteScroll,
    sortBy,
    sortOrder,
    businessContext: businessContext === 'ALL' ? undefined : businessContext,
    onPageReset: resetPageToFirst,
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

  // A aba Separação é filtrada no servidor (buildSeparationListWhere). Refiltrar
  // aqui escondia pedidos já paginados (ex.: NF_ATRELADA sem NF) e quebrava o
  // scroll infinito e o contador.
  const orders = fetchedOrders;

  useEffect(() => {
    if (pedidosError) {
      setBanner({ variant: 'error', message: pedidosError });
    }
  }, [pedidosError]);

  // Ao mudar filtro/busca/ordenação, volta à página 1 (evita append da página N
  // com critérios novos e scroll infinito sem fim).
  useEffect(() => {
    setPage(1);
  }, [
    statusFilter,
    searchDebounced,
    appliedFiltersForApi,
    sortBy,
    sortOrder,
    mode,
  ]);

  useEffect(() => {
    const t = setTimeout(
      () => setSearchDebounced(appliedFilters.search.trim()),
      360,
    );
    return () => clearTimeout(t);
  }, [appliedFilters.search]);

  useEffect(() => {
    const t = setTimeout(
      () => setFilterValueDebounced(appliedFilters.filterValue.trim()),
      360,
    );
    return () => clearTimeout(t);
  }, [appliedFilters.filterValue]);

  const refreshAll = useCallback(async () => {
    // Coalesce + trailing: se outro trigger chegar durante o fetch, roda no máximo
    // mais uma vez ao terminar (em vez de N requests paralelos/sequenciais).
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return refreshInFlightRef.current;
    }

    const run = (async () => {
      try {
        do {
          refreshQueuedRef.current = false;
          // Sempre volta à página 1 no refresh — evita dessincronizar scroll infinito.
          setPage(1);
          await refetchPedidos();
        } while (refreshQueuedRef.current);
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    refreshInFlightRef.current = run;
    return run;
  }, [refetchPedidos]);

  const refetchFromStart = useCallback(async () => {
    setPage(1);
    await refreshAll();
  }, [refreshAll]);

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
      const updated = await erpFetchJson<{
        unidadesFaltantes?: number;
        items?: Array<{ missingQty?: number; sku?: string }>;
      }>(`orders/${id}/send-to-picking`, { method: 'POST' });
      await refreshAll();
      const faltantes = updated.unidadesFaltantes ?? 0;
      if (faltantes > 0) {
        setToast({
          variant: 'ok',
          message: `Enviado para separação — ${faltantes} un. sem estoque (itens sinalizados).`,
          durationMs: 6500,
        });
      } else {
        setToast({ variant: 'ok', message: 'Pedido enviado para separação.' });
      }
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
        await erpFetchJson(`orders/${id}/attach-invoice`, {
          method: 'POST',
          body: JSON.stringify({ invoiceNumber: nf }),
        });
      }
      await refreshAll();
      setToast({
        variant: 'ok',
        message: 'NF-e vinculada. Imprima a etiqueta para confirmar a saída.',
      });
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
      setToast({
        variant: 'ok',
        message:
          qtyLine === 0
            ? 'Item marcado como pendente.'
            : qtyLine >= (item?.quantity ?? 0)
              ? 'Item confirmado (completo).'
              : 'Item confirmado (parcial).',
      });
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
          await erpFetchJson(pedidoApiUrl(numero, 'remover-separacao'), {
            method: 'POST',
          });
        } else {
          await erpFetchJson(`orders/${order.id}/remove-from-separation`, {
            method: 'POST',
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

  return {
    mode,
    statusFilter,
    setStatusFilter,
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
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
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

/** Mescla campos de workflow da fila sobre o detalhe, priorizando o status mais recente. */
function mergeListOrderIntoDetail(pedido: OrderDto, fromList: OrderDto): OrderDto {
  const pedidoUpdated = pedido.updatedAt
    ? new Date(pedido.updatedAt).getTime()
    : 0;
  const listUpdated = fromList.updatedAt
    ? new Date(fromList.updatedAt).getTime()
    : 0;
  const detailIsNewer = pedidoUpdated >= listUpdated;
  const status = detailIsNewer ? pedido.status : fromList.status;

  // Após remover da separação a lista pode já estar limpa enquanto o detalhe
  // ainda carrega NF antiga — não deixar invoice residual com status pré-pipeline.
  const prePipeline =
    status === 'NOVO' ||
    status === 'ANALISADO' ||
    status === 'RESERVADO' ||
    status === 'PARCIAL' ||
    (status as string) === 'PENDENTE';
  const listInvoice = fromList.invoiceNumber?.trim() || null;
  const detailInvoice = pedido.invoiceNumber?.trim() || null;
  let invoiceNumber: string | null;
  if (prePipeline && !listInvoice) {
    invoiceNumber = null;
  } else if (detailIsNewer) {
    invoiceNumber = detailInvoice;
  } else {
    invoiceNumber = listInvoice ?? detailInvoice;
  }

  // Campos anuláveis (volume/transportadora zerados no reenvio): `null` é valor
  // válido. `??` tratava null da fila como "ausente" e recolocava o valor antigo
  // do detalhe — volume/transportadora "não limpavam" e edições pediam F5.
  const pickNullable = <K extends keyof OrderDto>(key: K): OrderDto[K] => {
    if (detailIsNewer) return pedido[key];
    return (Object.prototype.hasOwnProperty.call(fromList, key)
      ? fromList[key]
      : pedido[key]) as OrderDto[K];
  };

  return {
    ...pedido,
    status,
    priority: detailIsNewer ? pedido.priority : fromList.priority,
    volumes: pickNullable('volumes'),
    notaRemessa: pickNullable('notaRemessa'),
    notaRemessaConfirmada: detailIsNewer
      ? pedido.notaRemessaConfirmada
      : (fromList.notaRemessaConfirmada ?? pedido.notaRemessaConfirmada),
    carrierId: pickNullable('carrierId'),
    carrierName: pickNullable('carrierName'),
    trackingCode: pickNullable('trackingCode'),
    invoiceNumber,
    invoiceStatus:
      prePipeline && !listInvoice
        ? 'NOT_FOUND'
        : detailIsNewer
          ? pedido.invoiceStatus
          : (fromList.invoiceStatus ?? pedido.invoiceStatus),
    mercadoEletronicoStatus: fromList.mercadoEletronicoStatus,
    contaAzulStatus: fromList.contaAzulStatus,
    physicalReservationActive: fromList.physicalReservationActive,
    stockReserveBlocked: fromList.stockReserveBlocked,
    updatedAt: detailIsNewer ? pedido.updatedAt : fromList.updatedAt,
  };
}

/** Detalhe do pedido selecionado (por número externo). */
export function useExpeditionSelectedPedido(selectedOrder: OrderDto | null) {
  const numero = selectedOrder?.externalOrderNumber ?? null;
  const { pedido, loading, error, refetch } = usePedidoDetalhe(numero);

  const displayOrder = useMemo(() => {
    if (!selectedOrder) return null;
    if (!pedido) return selectedOrder;
    return mergeListOrderIntoDetail(pedido, selectedOrder);
  }, [pedido, selectedOrder]);

  const refetchDetail = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    displayOrder,
    detailLoading: loading,
    detailError: error,
    refetchDetail,
  };
}
