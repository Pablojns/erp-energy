'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileText, PackageOpen } from 'lucide-react';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import {
  OrderInfoPanel,
  type OrderInfoPanelHandle,
} from '@/src/components/expedicao/workspace/order-info-panel';
import { ConcluirModal } from '@/src/components/expedicao/workspace/concluir-modal';
import { NfInputModal } from '@/src/components/expedicao/workspace/nf-input-modal';
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
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
}) {
  const { order, data, mode = 'orders', onAfterAction, isAdmin = false, onEditOrder } = props;
  const orderInfoRef = useRef<OrderInfoPanelHandle>(null);
  const [nfModalOpen, setNfModalOpen] = useState(false);
  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [exitGenerated, setExitGenerated] = useState(false);
  const [carrierSaving, setCarrierSaving] = useState(false);
  const [volumesValid, setVolumesValid] = useState(
    order != null && order.volumes != null && order.volumes >= 1,
  );

  useEffect(() => {
    setVolumesValid(order != null && order.volumes != null && order.volumes >= 1);
  }, [order?.id, order?.volumes]);

  if (!order) {
    return (
      <div className="exp-wb-panel exp-wb-panel--empty !gap-2 !p-3">
        <h2 className="exp-wb-panel-heading">Mesa de Trabalho de Separação</h2>
        <div className="exp-wb-empty-state">
          <PackageOpen className="h-14 w-14 text-[var(--exp-text-muted)]" aria-hidden />
          <p className="exp-wb-empty-title">Selecione um pedido para iniciar a separação.</p>
        </div>
      </div>
    );
  }

  const numero = orderDisplayNumber(order);
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
  const allItemsConfirmed =
    order.items.length > 0 &&
    order.items.every((it) => (it.pickedQty ?? 0) > 0);
  const hasAnySeparatedQty = order.items.some((it) => (it.pickedQty ?? 0) > 0);
  const canFinalizeSeparation = allItemsConfirmed;

  const handleFinalizeSeparation = async () => {
    if (!hasAnySeparatedQty) {
      data.setToast({
        variant: 'err',
        message: 'Confirme ao menos um item antes de finalizar',
      });
      return;
    }
    if (!allItemsConfirmed) {
      data.setToast({
        variant: 'err',
        message: 'Confirme todos os itens antes de finalizar a separação.',
      });
      return;
    }
    const saved = await orderInfoRef.current?.ensureVolumesSaved();
    if (!saved) {
      data.setToast({
        variant: 'err',
        message: 'Informe quantos volumes serão enviados (mínimo 1) antes de finalizar.',
      });
      return;
    }
    setConcluirModalOpen(true);
  };

  const orderStatus = order.status as string;
  const canGenerateExit =
    order.status === 'SEPARADO' ||
    order.status === 'AGUARDANDO_NF' ||
    order.status === 'NF_ATRELADA';
  const shouldShowNfAction = mode === 'separation' && canGenerateExit;
  const shouldShowConcludeAction = mode === 'separation' && !canGenerateExit && !exitGenerated;
  const shouldShowSaveAction = mode === 'separation' && !canGenerateExit && !exitGenerated;

  const canSendToSeparation = mode === 'orders' && (orderStatus === 'NOVO' || orderStatus === 'PENDENTE');
  const currentStep: 1 | 2 | 3 | 4 = (() => {
    if (order.status === 'FINALIZADO' || order.status === 'EXPEDIDO') return 4;
    if (
      order.status === 'NF_ATRELADA' ||
      order.status === 'SEPARADO' ||
      order.status === 'AGUARDANDO_NF'
    ) {
      return 3;
    }
    if (order.status === 'EM_SEPARACAO') return 2;
    return 1;
  })();

  return (
    <div className="exp-wb-panel !gap-2 !p-3">
      <OrderInfoPanel
        ref={orderInfoRef}
        order={order}
        panelMode={mode}
        isAdmin={isAdmin}
        onEditOrder={onEditOrder ? () => onEditOrder(order) : undefined}
        carrierSaving={carrierSaving}
        showFinalizeVolumesHint={shouldShowConcludeAction}
        onCarrierChange={async (carrierId) => {
          setCarrierSaving(true);
          try {
            await data.patchOrderCarrier(order, carrierId);
            onAfterAction?.();
          } finally {
            setCarrierSaving(false);
          }
        }}
        onNotaRemessaSaved={() => onAfterAction?.()}
        onVolumesSaved={() => {
          setVolumesValid(true);
          onAfterAction?.();
        }}
        onVolumesValidityChange={setVolumesValid}
        onStatusChanged={() => {
          void data.refreshAll();
          onAfterAction?.();
        }}
        onToggleUrgent={() => data.toggleOrderUrgent(order).then(() => onAfterAction?.())}
      />

      {mode === 'orders' ? <SeparationStepper currentStep={currentStep} /> : null}

      <SeparationItemsTable
        order={order}
        data={data}
        mode={mode}
        onAfterAction={onAfterAction}
      />

      {canSendToSeparation ? (
        <div className="exp-wb-triage exp-wb-triage--sticky !pt-2">
          <button
            type="button"
            className="exp-wb-btn exp-wb-btn--primary exp-wb-btn--full !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs"
            onClick={async () => {
              await data.patchOrderStatus(order.id, 'EM_SEPARACAO');
              onAfterAction?.();
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

      {mode === 'separation' ? (
        <>
          <div className="exp-wb-footer-spacer min-[1025px]:hidden" />
          <footer className="exp-wb-footer !gap-2 !pt-2">
            {shouldShowConcludeAction ? (
              <button
                type="button"
                className="exp-wb-btn exp-wb-btn--success exp-wb-footer-main !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
                disabled={concluding || !canFinalizeSeparation || !volumesValid}
                title={
                  !volumesValid
                    ? 'Informe quantos volumes serão enviados'
                    : canFinalizeSeparation
                      ? undefined
                      : 'Confirme todos os itens antes de finalizar'
                }
                onClick={() => void handleFinalizeSeparation()}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Finalizar Separação
              </button>
            ) : null}
            {shouldShowNfAction ? (
              <button
                type="button"
                className="exp-wb-btn exp-wb-btn--danger exp-wb-footer-main !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs"
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
                className="exp-wb-btn exp-wb-btn--ghost !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs"
                onClick={() => {
                  if (typeof data.saveSeparationProgress === 'function') {
                    void data.saveSeparationProgress(order.id);
                  } else {
                    void data.refreshAll();
                  }
                }}
              >
                Salvar Rascunho
              </button>
            ) : null}
            {exitGenerated || order.status === 'FINALIZADO' ? (
              <Link href="/app/expedicao/saidas" className="exp-wb-btn exp-wb-btn--ghost !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs">
                Ver em Saídas
              </Link>
            ) : null}
          </footer>
        </>
      ) : null}

      {concluirModalOpen ? (
        <ConcluirModal
          orderNumber={numero}
          receiverName={order.receiverName}
          items={order.items}
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
      <NfInputModal
        isOpen={nfModalOpen}
        onClose={() => setNfModalOpen(false)}
        pedidoNumero={numero}
        onConfirm={async (nfNumber) => {
          const ok = await data.attachInvoiceOrder(order.id, nfNumber);
          if (!ok) {
            throw new Error('Falha ao salvar NF');
          }
          setNfModalOpen(false);
          data.setToast({
            variant: 'ok',
            message: 'NF-e vinculada com sucesso!',
          });
          onAfterAction?.();
        }}
      />
    </div>
  );
}
