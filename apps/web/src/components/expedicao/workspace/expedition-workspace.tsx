'use client';
/* eslint-disable react-hooks/set-state-in-effect -- seleção/tabs sincronizam com atualização da fila */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminOrderEditModal } from '@/src/components/expedicao/workspace/admin-order-edit-modal';
import { NewOrderModal } from '@/src/components/expedicao/workspace/new-order-modal';
import { DeleteOrderModal } from '@/src/components/expedicao/workspace/delete-order-modal';
import { OrderQueue } from '@/src/components/expedicao/workspace/order-queue';
import { SeparationWorkbench } from '@/src/components/expedicao/workspace/separation-workbench';
import type { OrderDto, StatusFilterId } from '@/src/components/expedicao/shared/types';
import {
  useExpeditionPedidosBridge,
  useExpeditionSelectedPedido,
} from '@/src/hooks/useExpeditionPedidosBridge';

export type ExpeditionWorkspaceMode = 'orders' | 'separation';

export function ExpeditionWorkspace(props: {
  mode: ExpeditionWorkspaceMode;
  initialStatusFilter?: StatusFilterId;
  onNewOrder?: () => void;
  isAdmin?: boolean;
}) {
  const { mode, initialStatusFilter, onNewOrder, isAdmin = false } = props;
  const data = useExpeditionPedidosBridge({
    mode: mode === 'separation' ? 'separation' : 'expedition',
    initialStatusFilter:
      initialStatusFilter ?? 'all',
  });

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [adminEditOrder, setAdminEditOrder] = useState<OrderDto | null>(null);
  const [editOrder, setEditOrder] = useState<OrderDto | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderDto | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fila' | 'detalhes'>('fila');

  const selectedInList =
    data.orders.find((o) => o.id === selectedOrderId) ?? null;

  const { displayOrder, detailLoading, detailError, refetchDetail } =
    useExpeditionSelectedPedido(selectedInList, () => void data.refreshAll());

  useEffect(() => {
    if (data.ordersLoading) return;
    if (selectedOrderId && data.orders.some((o) => o.id === selectedOrderId)) {
      return;
    }
    if (data.orders.length > 0) {
      setSelectedOrderId(data.orders[0].id);
    } else {
      setSelectedOrderId(null);
    }
  }, [data.orders, data.ordersLoading, selectedOrderId]);

  useEffect(() => {
    setSelectedOrderId(null);
    setActiveTab('fila');
  }, [data.statusFilter, mode]);

  useEffect(() => {
    const onRefresh = () => void data.refreshAll();
    window.addEventListener('expedition-refresh', onRefresh);
    return () => window.removeEventListener('expedition-refresh', onRefresh);
  }, [data.refreshAll]);

  const openOrderEdit = (order: OrderDto) => {
    if (order.source === 'WEG_MERCADO_ELETRONICO') {
      setAdminEditOrder(order);
      return;
    }
    setEditOrder(order);
    setNewOrderOpen(true);
  };

  return (
    <div className="flex min-h-0 w-full flex-col gap-3 overflow-hidden px-4 pt-2 pb-2">
      <div className="exp-mobile-tabs flex shrink-0 lg:hidden">
        <button
          type="button"
          onClick={() => setActiveTab('fila')}
          className={`exp-mobile-tab-btn ${activeTab === 'fila' ? 'exp-mobile-tab-btn--active' : ''}`}
        >
          📋 Fila de Pedidos
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('detalhes')}
          className={`exp-mobile-tab-btn ${activeTab === 'detalhes' ? 'exp-mobile-tab-btn--active' : ''}`}
        >
          🔍 Detalhes
        </button>
      </div>

      <div className="exp-page-layout min-h-0 flex-1">
        <div className={`exp-page-col-queue w-full ${activeTab === 'fila' ? 'block' : 'hidden'} lg:block`}>
          <OrderQueue
            data={data}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onOrderChosen={() => setActiveTab('detalhes')}
            title={mode === 'orders' ? 'Pedidos' : 'Fila de Pedidos p/ Separação'}
            onNewOrder={
              mode === 'orders'
                ? onNewOrder ??
                  (() => {
                    setEditOrder(null);
                    setNewOrderOpen(true);
                  })
                : onNewOrder
            }
            onRefresh={() => void data.refreshAll()}
            isAdmin={isAdmin}
            onEditOrder={
              mode === 'orders' && isAdmin
                ? (order) => openOrderEdit(order)
                : undefined
            }
            onDeleteOrder={
              mode === 'orders' ? (order) => setDeleteOrder(order) : undefined
            }
            queueMode={mode}
          />
        </div>
        <div className={`exp-page-col-workbench w-full ${activeTab === 'detalhes' ? 'block' : 'hidden'} lg:block`}>
          {detailLoading && !displayOrder ? (
            <div className="exp-wb-panel exp-wb-panel--empty">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
              <p className="exp-wb-empty-title">Carregando detalhes do pedido…</p>
            </div>
          ) : detailError && !displayOrder ? (
            <div className="exp-wb-panel exp-wb-panel--empty">
              <p className="exp-wb-empty-title text-red-400">{detailError}</p>
            </div>
          ) : (
            <SeparationWorkbench
              order={displayOrder}
              data={data}
              mode={mode}
              isAdmin={isAdmin}
              onEditOrder={mode === 'orders' && isAdmin ? openOrderEdit : undefined}
              onAfterAction={() => void refetchDetail()}
            />
          )}
        </div>
      </div>

      {data.banner ? (
        <div
          role="alert"
          className="exp-toast exp-toast--err"
        >
          {data.banner.message}
        </div>
      ) : null}

      {data.toast ? (
        <div
          role="status"
          className={`exp-toast exp-toast--${data.toast.variant === 'ok' ? 'ok' : 'err'}`}
        >
          {data.toast.message}
        </div>
      ) : null}

      {mode === 'orders' ? (
        <>
          <NewOrderModal
            isOpen={newOrderOpen}
            editOrder={editOrder}
            onClose={() => {
              setNewOrderOpen(false);
              setEditOrder(null);
            }}
            onCreated={() => {
              void data.refreshAll();
              data.setToast({
                variant: 'ok',
                message: editOrder
                  ? 'Pedido atualizado com sucesso.'
                  : 'Pedido criado com sucesso e adicionado à fila.',
              });
              setEditOrder(null);
            }}
          />
          <AdminOrderEditModal
            isOpen={Boolean(adminEditOrder)}
            order={adminEditOrder}
            onClose={() => setAdminEditOrder(null)}
            onSaved={() => {
              void data.refreshAll();
              void refetchDetail();
              data.setToast({
                variant: 'ok',
                message: 'Pedido atualizado (registrado nos logs).',
              });
              setAdminEditOrder(null);
            }}
          />
          <DeleteOrderModal
            order={deleteOrder}
            isOpen={Boolean(deleteOrder)}
            onClose={() => setDeleteOrder(null)}
            onDeleted={() => {
              void data.refreshAll();
              setSelectedOrderId(null);
              data.setToast({
                variant: 'ok',
                message: 'Pedido excluído com sucesso.',
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
