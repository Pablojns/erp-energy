'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  PackageOpen,
} from 'lucide-react';
import {
  formatBrlDisplay,
  formatDayDisplay,
} from '@/src/components/expedicao/expedition-wms-layout';
import {
  formatOverdueLabel,
  getOverdueDays,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import { OrderInfoPanel } from '@/src/components/expedicao/workspace/order-info-panel';
import { ConcluirModal } from '@/src/components/expedicao/workspace/concluir-modal';
import { GerarNfModal } from '@/src/components/expedicao/workspace/gerar-nf-modal';
import { SeparationStepper } from '@/src/components/expedicao/workspace/separation-stepper';
import { SeparationItemsTable } from '@/src/components/expedicao/workspace/separation-items-table';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

export function SeparationWorkbench(props: {
  order: OrderDto | null;
  data: OrdersData;
  mode?: 'orders' | 'separation';
  onAfterAction?: () => void;
}) {
  const { order, data, mode = 'orders', onAfterAction } = props;
  const [nfModalOpen, setNfModalOpen] = useState(false);
  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [exitGenerated, setExitGenerated] = useState(false);

  if (!order) {
    return (
      <div className="exp-wb-panel exp-wb-panel--empty">
        <h2 className="exp-wb-panel-heading">Mesa de Trabalho de Separação</h2>
        <div className="exp-wb-empty-state">
          <PackageOpen className="h-14 w-14 text-[var(--exp-text-muted)]" aria-hidden />
          <p className="exp-wb-empty-title">Selecione um pedido para iniciar a separação.</p>
        </div>
      </div>
    );
  }

  const numero = orderDisplayNumber(order);
  const overdue = getOverdueDays(order);
  const urgent = order.priority <= 2;
  const itemCounts = order.items.reduce(
    (acc, it) => {
      const picked = it.pickedQty ?? 0;
      if (picked >= it.quantity && it.quantity > 0) {
        acc.complete += 1;
      } else if (picked > 0) {
        acc.partial += 1;
      } else {
        acc.pending += 1;
      }
      return acc;
    },
    { complete: 0, partial: 0, pending: 0 },
  );
  const finalLotStatus = itemCounts.pending === 0 && itemCounts.partial === 0 ? 'COMPLETO' : 'PARCIAL';
  const totalItems = order.items.length;
  const confirmedItems = totalItems - itemCounts.pending;
  const progressPct = totalItems > 0 ? Math.round((confirmedItems / totalItems) * 100) : 0;
  const allItemsConfirmed = totalItems > 0 && itemCounts.pending === 0;

  const isPartial =
    order.status === 'PARCIAL' || itemCounts.partial > 0 || (itemCounts.complete > 0 && itemCounts.pending > 0);
  const needsInvoice = order.status === 'AGUARDANDO_NF' || order.status === 'NF_ATRELADA' || order.status === 'SEPARADO';
  const inSeparation = order.status === 'EM_SEPARACAO';
  const isComplete =
    order.status === 'FINALIZADO' ||
    order.status === 'EXPEDIDO' ||
    (itemCounts.pending === 0 && itemCounts.partial === 0 && itemCounts.complete > 0);
  const isOverdue = overdue !== null;
  const canGenerateExit =
    order.status === 'SEPARADO' ||
    order.status === 'AGUARDANDO_NF' ||
    order.status === 'NF_ATRELADA';
  const shouldShowNfAction = mode === 'separation' && canGenerateExit;
  const shouldShowConcludeAction = mode === 'separation' && !canGenerateExit && !exitGenerated;
  const shouldShowSaveAction = mode === 'separation' && !canGenerateExit && !exitGenerated;

  const orderStatus = order.status as string;
  const canSendToSeparation = mode === 'orders' && (orderStatus === 'NOVO' || orderStatus === 'PENDENTE');
  const showEmSeparacaoBadge = mode === 'orders' && order.status === 'EM_SEPARACAO';
  const showFinalizadoBadge = mode === 'orders' && order.status === 'FINALIZADO';
  const currentStep: 1 | 2 | 3 | 4 | 5 = (() => {
    if (order.status === 'FINALIZADO' || order.status === 'EXPEDIDO') return 5;
    if (order.status === 'NF_ATRELADA') return 4;
    if (
      order.status === 'SEPARADO' ||
      order.status === 'AGUARDANDO_NF'
    ) {
      return 3;
    }
    if (order.status === 'EM_SEPARACAO') return 2;
    return 1;
  })();
  const todayLabel = new Intl.DateTimeFormat('pt-BR').format(new Date());

  return (
    <div className="exp-wb-panel">
      <div className="exp-wb-order-head">
        <p className="exp-wb-order-number">#{numero}</p>
        <p className="exp-wb-order-value">{formatBrlDisplay(order.totalValue)}</p>
        <div className="exp-wb-order-badges">
          {urgent ? <span className="exp-wb-order-badge exp-wb-order-badge--urgent">URGENTE</span> : null}
          {isPartial ? <span className="exp-wb-order-badge exp-wb-order-badge--partial">PARCIAL</span> : null}
          {isComplete ? <span className="exp-wb-order-badge exp-wb-order-badge--complete">COMPLETO</span> : null}
          {inSeparation ? <span className="exp-wb-order-badge exp-wb-order-badge--sep">EM SEPARAÇÃO</span> : null}
          {needsInvoice ? <span className="exp-wb-order-badge exp-wb-order-badge--note">FAZER NOTA</span> : null}
          {isOverdue ? <span className="exp-wb-order-badge exp-wb-order-badge--late">ATRASADO</span> : null}
        </div>
      </div>

      <div className="exp-wb-deadline-card">
        <div className="exp-wb-deadline-left">
          <div className="exp-wb-deadline-icon">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="exp-wb-deadline-text">
              <span className="exp-wb-inline-label">Entrega:</span>{' '}
              <span className="exp-wb-inline-value">
                {order.requestedDeliveryDate ? formatDayDisplay(order.requestedDeliveryDate) : 'não informada'}
              </span>
            </p>
            {overdue !== null ? (
              <span className="exp-wb-late-badge">{formatOverdueLabel(overdue)}</span>
            ) : null}
          </div>
        </div>
      </div>

      <OrderInfoPanel order={order} />

      <SeparationStepper currentStep={currentStep} />

      {mode === 'separation' ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="text-[var(--text-primary)]">
              {confirmedItems} de {totalItems} itens confirmados
            </span>
            <span className="text-[var(--text-secondary)]">{progressPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--input-bg)]">
            <div
              className={`h-2 rounded-full transition-all ${
                progressPct === 100
                  ? 'bg-[#22c55e]'
                  : progressPct > 0
                    ? 'bg-[#f59e0b]'
                    : 'bg-[var(--text-muted)]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      <SeparationItemsTable
        order={order}
        data={data}
        mode={mode}
        onAfterAction={onAfterAction}
      />

      {canSendToSeparation ? (
        <div className="exp-wb-triage exp-wb-triage--sticky">
          <button
            type="button"
            className="exp-wb-btn exp-wb-btn--primary exp-wb-btn--full"
            onClick={() => {
              void data.patchOrderStatus(order.id, 'EM_SEPARACAO');
              data.setToast({
                variant: 'ok',
                message: `Pedido #${numero} enviado para separação ✓`,
              });
            }}
          >
            → Enviar para separação
          </button>
        </div>
      ) : null}
      {showEmSeparacaoBadge ? (
        <div className="exp-wb-triage exp-wb-triage--sticky">
          <span className="exp-wb-order-badge exp-wb-order-badge--sep">Em separação</span>
        </div>
      ) : null}
      {showFinalizadoBadge ? (
        <div className="exp-wb-triage exp-wb-triage--sticky">
          <span className="exp-wb-order-badge exp-wb-order-badge--complete">Finalizado</span>
        </div>
      ) : null}

      {mode === 'separation' ? (
        <>
          <div className="exp-wb-footer-spacer min-[1025px]:hidden" />
          <footer className="exp-wb-footer">
            {shouldShowConcludeAction ? (
              <button
                type="button"
                className="exp-wb-btn exp-wb-btn--success exp-wb-footer-main disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!allItemsConfirmed}
                title={allItemsConfirmed ? undefined : 'Confirme todos os itens antes de concluir'}
                onClick={() => setConcluirModalOpen(true)}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Concluir lote de separação
              </button>
            ) : null}
            {shouldShowNfAction ? (
              <button
                type="button"
                className="exp-wb-btn exp-wb-btn--danger exp-wb-footer-main"
                onClick={() => {
                  setNfModalOpen(true);
                }}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Gerar NF-e
              </button>
            ) : null}
            {shouldShowSaveAction ? (
              <button
                type="button"
                className="exp-wb-btn exp-wb-btn--ghost"
                onClick={() => {
                  if (typeof data.saveSeparationProgress === 'function') {
                    void data.saveSeparationProgress(order.id);
                  } else {
                    void data.refreshAll();
                  }
                }}
              >
                Salvar separação
              </button>
            ) : null}
            {exitGenerated || order.status === 'FINALIZADO' ? (
              <Link href="/app/expedicao/saidas" className="exp-wb-btn exp-wb-btn--ghost">
                Ver em Saídas
              </Link>
            ) : null}
          </footer>
        </>
      ) : null}

      {concluirModalOpen ? (
        <ConcluirModal
          orderNumber={numero}
          customerName={order.customerName}
          complete={itemCounts.complete}
          partial={itemCounts.partial}
          pending={itemCounts.pending}
          finalStatus={finalLotStatus}
          loading={concluding}
          onCancel={() => setConcluirModalOpen(false)}
          onConfirm={() => {
            setConcluding(true);
            const handler =
              typeof data.concludeSeparation === 'function'
                ? data.concludeSeparation(order.id)
                : data.markAllSeparatedFromReserved(order.id);
            void Promise.resolve(handler)
              .then((ok) => {
                if (ok === false) return;
                setConcluirModalOpen(false);
                data.setToast({
                  variant: 'ok',
                  message: `Lote concluído — Pedido #${numero} marcado como ${finalLotStatus}`,
                });
                onAfterAction?.();
              })
              .finally(() => setConcluding(false));
          }}
        />
      ) : null}
      {nfModalOpen ? (
        <GerarNfModal
          orderNumber={numero}
          deliveryCnpj={order.deliveryCnpj}
          totalValueLabel={formatBrlDisplay(order.totalValue)}
          issueDateLabel={todayLabel}
          onCancel={() => setNfModalOpen(false)}
          onQueued={({ posicaoNaFila }) => {
            setNfModalOpen(false);
            data.setToast({
              variant: 'ok',
              message: `Pedido #${numero} adicionado à fila de emissão (posição ${posicaoNaFila}).`,
            });
            onAfterAction?.();
          }}
        />
      ) : null}
    </div>
  );
}
