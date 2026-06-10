'use client';

/* eslint-disable react-hooks/set-state-in-effect -- sync fetch com filtros */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildFilterParams,
  clientRefineOrders,
} from '@/src/components/expedicao/shared/filter-params';
import {
  INITIAL_FILTERS,
  todayIsoDate,
} from '@/src/components/expedicao/shared/constants';
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
import { isOrderOverdue } from '@/src/components/expedicao/shared/order-helpers';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type UseExpeditionOrdersOptions = {
  mode?: 'expedition' | 'separation';
  initialStatusFilter?: StatusFilterId;
};

export function useExpeditionOrders(opts: UseExpeditionOrdersOptions = {}) {
  const mode = opts.mode ?? 'expedition';
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>(
    opts.initialStatusFilter ?? (mode === 'separation' ? 'em_separacao' : 'all'),
  );
  const [separationSubFilter, setSeparationSubFilter] = useState('all');

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [kpiStrip, setKpiStrip] = useState<ExpeditionKpiStrip | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [sum, setSum] = useState<ExpeditionSummary | null>(null);
  const [sumLoading, setSumLoading] = useState(true);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [meta, setMeta] = useState<PaginatedOrders['meta'] | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reservingOrderId, setReservingOrderId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterFormState>(INITIAL_FILTERS);
  const [searchDebounced, setSearchDebounced] = useState('');

  const filterParams = useCallback(() => {
    return buildFilterParams({
      appliedFilters,
      searchDebounced,
      statusFilter,
      mode,
      separationSubFilter:
        mode === 'separation' ? separationSubFilter : undefined,
    });
  }, [appliedFilters, searchDebounced, statusFilter, mode, separationSubFilter]);

  const appliedFiltersKey = JSON.stringify({
    statusFilter,
    separationSubFilter,
    filters: appliedFilters,
  });

  const loadSummary = useCallback(async () => {
    setSumLoading(true);
    try {
      const qs = filterParams().toString();
      const res = await erpFetchJson<ExpeditionSummary>(
        qs.length ? `orders/summary?${qs}` : 'orders/summary',
      );
      setSum(res);
    } catch {
      setSum(null);
    } finally {
      setSumLoading(false);
    }
  }, [filterParams]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setBanner(null);
    try {
      const params = filterParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      const res = await erpFetchJson<PaginatedOrders>(
        `orders?${params.toString()}`,
      );
      const refined = clientRefineOrders(
        res.data,
        statusFilter,
        mode === 'separation' ? separationSubFilter : undefined,
        isOrderOverdue,
      );
      setOrders(refined);
      setMeta(res.meta);
    } catch (e) {
      setBanner({
        variant: 'error',
        message:
          e instanceof Error ? e.message : 'Falha ao carregar pedidos.',
      });
      setOrders([]);
      setMeta(null);
    } finally {
      setOrdersLoading(false);
    }
  }, [filterParams, page, statusFilter, mode, separationSubFilter]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadOrders()]);
  }, [loadSummary, loadOrders]);

  useEffect(() => {
    const t = setTimeout(
      () => setSearchDebounced(appliedFilters.search.trim()),
      360,
    );
    return () => clearTimeout(t);
  }, [appliedFilters.search]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, separationSubFilter, appliedFiltersKey]);

  useEffect(() => {
    if (!sum) {
      setKpiStrip(null);
      return;
    }
    let cancelled = false;
    setKpiLoading(true);
    void (async () => {
      try {
        const base = filterParams();
        const iso = todayIsoDate();
        const merge = (extra: Record<string, string>) => {
          const p = new URLSearchParams(base.toString());
          for (const [k, v] of Object.entries(extra)) p.set(k, v);
          return p;
        };
        const [sumHoje, parMeta, finHoje, resMeta] = await Promise.all([
          erpFetchJson<ExpeditionSummary>(
            `orders/summary?${merge({ orderDateFrom: iso, orderDateTo: iso }).toString()}`,
          ),
          erpFetchJson<PaginatedOrders>(
            `orders?${merge({ status: 'PARCIAL', page: '1', pageSize: '1' }).toString()}`,
          ),
          erpFetchJson<PaginatedOrders>(
            `orders?${merge({ status: 'FINALIZADO', orderDateFrom: iso, orderDateTo: iso, page: '1', pageSize: '1' }).toString()}`,
          ),
          erpFetchJson<PaginatedOrders>(
            `orders?${merge({ status: 'RESERVADO', page: '1', pageSize: '1' }).toString()}`,
          ),
        ]);
        if (!cancelled) {
          setKpiStrip({
            pedidosHoje: sumHoje.totalPedidos,
            urgentes: sum.urgentes,
            emSeparacao: sum.emSeparacao,
            parciais: parMeta.meta.total,
            comFalta: sum.rupturaPedidos ?? 0,
            aguardandoNf: sum.aguardandoNf,
            saidasHoje: finHoje.meta.total,
            reservados: resMeta.meta.total,
          });
        }
      } catch {
        if (!cancelled) setKpiStrip(null);
      } finally {
        if (!cancelled) setKpiLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sum, filterParams]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function reserveOrder(id: string) {
    setReservingOrderId(id);
    try {
      await erpFetchJson<OrderDto>(`orders/${id}/reserve`, { method: 'POST' });
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
      await erpFetchJson<OrderDto>(`orders/${id}/send-to-picking`, {
        method: 'POST',
      });
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
    try {
      await erpFetchJson<OrderDto>(`orders/${id}/mark-picked`, {
        method: 'POST',
      });
      await refreshAll();
      setToast({ variant: 'ok', message: 'Pedido marcado como separado.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao marcar separado.',
      });
    }
  }

  async function attachInvoiceOrder(id: string) {
    const n = window.prompt('Número da nota fiscal');
    if (!n?.trim()) return;
    try {
      await erpFetchJson<OrderDto>(`orders/${id}/attach-invoice`, {
        method: 'POST',
        body: JSON.stringify({ invoiceNumber: n.trim() }),
      });
      await refreshAll();
      setToast({ variant: 'ok', message: 'NF atrelada — saída automática na finalização.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao atrelar NF.',
      });
    }
  }

  async function finalizeExpeditionOrder(id: string) {
    try {
      await erpFetchJson<OrderDto>(`orders/${id}/finalize-expedition`, {
        method: 'POST',
      });
      await refreshAll();
      setToast({
        variant: 'ok',
        message: 'Saída registrada — estoque baixado.',
      });
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
      await erpFetchJson<OrderDto>(`orders/${order.id}/priority`, {
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
    try {
      await erpFetchJson(`orders/${orderId}/items/${itemId}/picked-qty`, {
        method: 'PATCH',
        body: JSON.stringify({ pickedQty: qtyLine }),
      });
      await refreshAll();
      setToast({ variant: 'ok', message: 'Quantidade separada atualizada.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha ao atualizar linha.',
      });
    }
  }

  async function markAllSeparatedFromReserved(orderId: string) {
    const o = orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'EM_SEPARACAO') {
      setToast({ variant: 'err', message: 'Pedido deve estar em separação.' });
      return;
    }
    try {
      for (const it of o.items) {
        const target = Math.min(it.reservedQuantity, it.quantity);
        await erpFetchJson(`orders/${orderId}/items/${it.id}/picked-qty`, {
          method: 'PATCH',
          body: JSON.stringify({ pickedQty: target }),
        });
      }
      await refreshAll();
      setToast({ variant: 'ok', message: 'Itens marcados conforme reserva.' });
    } catch (e) {
      setToast({
        variant: 'err',
        message: e instanceof Error ? e.message : 'Falha em lote.',
      });
    }
  }

  async function patchOrderStatus(id: string, status: OrderStatus) {
    try {
      await erpFetchJson<OrderDto>(`orders/${id}/status`, {
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
      pronto_separacao: kpiStrip?.reservados ?? sum.reservados,
      parcial: kpiStrip?.parciais,
    } as Partial<Record<StatusFilterId, number>>;
  }, [sum, kpiStrip]);

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
    patchOrderStatus,
    confirmCancelOrder,
  };
}
