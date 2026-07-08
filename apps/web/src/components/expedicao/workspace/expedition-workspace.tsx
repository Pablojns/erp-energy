'use client';
/* eslint-disable react-hooks/set-state-in-effect -- seleção/tabs sincronizam com atualização da fila */

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminOrderEditModal } from '@/src/components/expedicao/workspace/admin-order-edit-modal';
import { NewOrderModal } from '@/src/components/expedicao/workspace/new-order-modal';
import { NewSiteOrderModal } from '@/src/components/expedicao/workspace/new-site-order-modal';
import { NewVendaExternaModal } from '@/src/components/expedicao/workspace/new-venda-externa-modal';
import { WegImportModal } from '@/src/components/expedicao/workspace/weg-import-modal';
import { DeleteOrderModal } from '@/src/components/expedicao/workspace/delete-order-modal';
import { OrderQueue } from '@/src/components/expedicao/workspace/order-queue';
import { SeparationWorkbench } from '@/src/components/expedicao/workspace/separation-workbench';
import type { OrderDto, StatusFilterId } from '@/src/components/expedicao/shared/types';
import {
  useExpeditionPedidosBridge,
  useExpeditionSelectedPedido,
} from '@/src/hooks/useExpeditionPedidosBridge';
import { useExpedicaoHeaderActions } from '@/src/components/expedicao/layout/expedicao-header-actions-context';

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
    initialOrderSource:
      mode === 'orders' ? 'WEG_MERCADO_ELETRONICO' : 'all',
  });

  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [siteOrderOpen, setSiteOrderOpen] = useState(false);
  const [vendaExternaOpen, setVendaExternaOpen] = useState(false);
  const [wegImportOpen, setWegImportOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'WEG' | 'SITE' | 'VENDA_EXTERNA'>('WEG');
  const prevSourceFilterRef = useRef(sourceFilter);
  const [adminEditOrder, setAdminEditOrder] = useState<OrderDto | null>(null);
  const [editOrder, setEditOrder] = useState<OrderDto | null>(null);
  const [deleteOrder, setDeleteOrder] = useState<OrderDto | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fila' | 'detalhes'>('fila');

  const selectedInList =
    data.orders.find((o) => o.id === selectedOrderId) ?? null;

  const { displayOrder, detailLoading, detailError, refetchDetail } =
    useExpeditionSelectedPedido(selectedInList, () => void data.refreshAll());

  const handleAfterAction = async () => {
    await refetchDetail();
    setSelectedOrderId((current) => {
      if (current && data.orders.some((o) => o.id === current)) return current;
      return data.orders[0]?.id ?? null;
    });
  };

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
  }, [data.statusFilter, mode, sourceFilter]);

  useEffect(() => {
    if (mode !== 'orders') return;
    const nextSource =
      sourceFilter === 'WEG'
        ? 'WEG_MERCADO_ELETRONICO'
        : sourceFilter === 'SITE'
          ? 'SITE'
          : 'VENDA_EXTERNA';
    data.setAppliedFilters((f) => {
      if (f.source === nextSource) return f;
      return { ...f, source: nextSource };
    });
    if (prevSourceFilterRef.current !== sourceFilter) {
      prevSourceFilterRef.current = sourceFilter;
      data.setPage(1);
    }
  }, [sourceFilter, mode, data.setPage, data.setAppliedFilters]);

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

  const orderQueue = (
    <OrderQueue
      data={data}
      selectedOrderId={selectedOrderId}
      onSelectOrder={setSelectedOrderId}
      onOrderChosen={() => setActiveTab('detalhes')}
      title={mode === 'separation' ? 'Fila de Pedidos p/ Separação' : undefined}
      sourceFilter={mode === 'orders' ? sourceFilter : undefined}
      onSourceFilterChange={mode === 'orders' ? setSourceFilter : undefined}
      onNewOrder={
        mode === 'orders' && sourceFilter === 'WEG'
          ? onNewOrder ??
            (() => {
              setEditOrder(null);
              setNewOrderOpen(true);
            })
          : onNewOrder
      }
      onNewSiteOrder={
        mode === 'orders' && sourceFilter === 'SITE'
          ? () => {
              setSiteOrderOpen(true);
            }
          : undefined
      }
      onNewVendaExterna={
        mode === 'orders' && sourceFilter === 'VENDA_EXTERNA'
          ? () => {
              setVendaExternaOpen(true);
            }
          : undefined
      }
      onImportWeg={
        mode === 'orders' && sourceFilter === 'WEG'
          ? () => setWegImportOpen(true)
          : undefined
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
  );

  const { setTopActions, setBelowSubnavActions } = useExpedicaoHeaderActions();

  useEffect(() => {
    // Limpamos ao desmontar o workspace (evita ações "presas" em outra rota da expedição).
    return () => {
      setTopActions(null);
      setBelowSubnavActions(null);
    };
  }, [setBelowSubnavActions, setTopActions]);

  useEffect(() => {
    if (mode !== 'orders') {
      setTopActions(null);
      setBelowSubnavActions(null);
      return;
    }

    const secondaryBtnClass =
      'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-white/5';
    const primaryBtnClass =
      'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500';

    const handleNewOrder = () => {
      if (mode !== 'orders') return;
      if (sourceFilter === 'WEG') {
        if (onNewOrder) return onNewOrder();
        setEditOrder(null);
        setNewOrderOpen(true);
        return;
      }
      if (sourceFilter === 'SITE') {
        setSiteOrderOpen(true);
        return;
      }
      setVendaExternaOpen(true);
    };

    setTopActions(
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className={primaryBtnClass} onClick={handleNewOrder}>
            {sourceFilter === 'WEG'
              ? '+ Novo Pedido'
              : sourceFilter === 'SITE'
                ? 'Novo Pedido Site'
                : 'Nova Venda Externa'}
          </button>
        </div>

        {sourceFilter === 'WEG' ? (
          <button
            type="button"
            className={secondaryBtnClass}
            onClick={() => setWegImportOpen(true)}
          >
            Importar WEG
          </button>
        ) : (
          <div />
        )}
      </div>,
    );

    setBelowSubnavActions(
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          className={
            sourceFilter === 'WEG'
              ? primaryBtnClass
              : secondaryBtnClass
          }
          onClick={() => setSourceFilter('WEG')}
        >
          WEG
        </button>
        <button
          type="button"
          className={
            sourceFilter === 'SITE'
              ? primaryBtnClass
              : secondaryBtnClass
          }
          onClick={() => setSourceFilter('SITE')}
        >
          Site
        </button>
        <button
          type="button"
          className={
            sourceFilter === 'VENDA_EXTERNA'
              ? primaryBtnClass
              : secondaryBtnClass
          }
          onClick={() => setSourceFilter('VENDA_EXTERNA')}
        >
          Venda Externa
        </button>
      </div>,
    );
  }, [mode, onNewOrder, setBelowSubnavActions, setTopActions, sourceFilter]);

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] min-h-0 w-full flex-col gap-2 overflow-hidden px-2 pt-2 pb-2 max-lg:h-[calc(100dvh-14.5rem)]">
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

      <div className="exp-page-layout flex h-full min-h-0 flex-1 flex-col">
        <div
          className={`exp-page-col-queue flex h-full min-h-0 w-full flex-col ${activeTab === 'fila' ? 'block' : 'hidden'} lg:block`}
        >
          {orderQueue}
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
              onAfterAction={() => void handleAfterAction()}
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
            onCreated={async (created) => {
              data.setStatusFilter('all');
              data.setPage(1);
              data.setAppliedFilters((f) => ({
                ...f,
                source: 'WEG_MERCADO_ELETRONICO',
                search: '',
              }));
              await data.refetchFromStart();
              window.dispatchEvent(new Event('expedition-refresh'));
              if (created?.id) {
                setSelectedOrderId(created.id);
                setActiveTab('detalhes');
              }
              data.setToast({
                variant: 'ok',
                message: editOrder
                  ? 'Pedido atualizado com sucesso.'
                  : 'Pedido criado com sucesso e adicionado à fila.',
              });
              setEditOrder(null);
            }}
          />
          <NewSiteOrderModal
            isOpen={siteOrderOpen}
            onClose={() => setSiteOrderOpen(false)}
            onCreated={async (created) => {
              data.setStatusFilter('all');
              data.setPage(1);
              await data.refetchFromStart();
              window.dispatchEvent(new Event('expedition-refresh'));
              if (created?.id) {
                setSelectedOrderId(created.id);
                setActiveTab('detalhes');
              }
              data.setToast({
                variant: 'ok',
                message:
                  'Pedido do site criado, estoque reservado e enviado para separação.',
              });
            }}
          />
          <NewVendaExternaModal
            isOpen={vendaExternaOpen}
            onClose={() => setVendaExternaOpen(false)}
            onCreated={async (created) => {
              data.setStatusFilter('all');
              data.setPage(1);
              data.setAppliedFilters((f) => ({
                ...f,
                source: 'VENDA_EXTERNA',
                search: '',
              }));
              await data.refetchFromStart();
              window.dispatchEvent(new Event('expedition-refresh'));
              if (created?.id) {
                setSelectedOrderId(created.id);
                setActiveTab('detalhes');
              }
              data.setToast({
                variant: 'ok',
                message: 'Venda externa criada e adicionada à fila.',
              });
            }}
          />
          <WegImportModal
            isOpen={wegImportOpen}
            onClose={() => setWegImportOpen(false)}
            onImported={() => {
              void data.refetchFromStart();
              window.dispatchEvent(new Event('expedition-refresh'));
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
