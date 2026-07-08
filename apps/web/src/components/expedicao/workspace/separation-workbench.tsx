'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileText, Loader2, PackageOpen, Tag } from 'lucide-react';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import { OrderInfoPanel } from '@/src/components/expedicao/workspace/order-info-panel';
import { ConcluirModal } from '@/src/components/expedicao/workspace/concluir-modal';
import { NfInputModal } from '@/src/components/expedicao/workspace/nf-input-modal';
import { SeparationStepper } from '@/src/components/expedicao/workspace/separation-stepper';
import { SeparationItemsTable } from '@/src/components/expedicao/workspace/separation-items-table';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

function parseVolumesInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function SeparationWorkbench(props: {
  order: OrderDto | null;
  data: OrdersData;
  mode?: 'orders' | 'separation';
  onAfterAction?: () => void;
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
}) {
  const { order, data, mode = 'orders', onAfterAction, isAdmin = false, onEditOrder } = props;
  const [nfModalOpen, setNfModalOpen] = useState(false);
  const [concluirModalOpen, setConcluirModalOpen] = useState(false);
  const [concluding, setConcluding] = useState(false);
  const [exitGenerated, setExitGenerated] = useState(false);
  const [printingEtiqueta, setPrintingEtiqueta] = useState(false);
  const [readyForEtiqueta, setReadyForEtiqueta] = useState(false);
  const [carrierSaving, setCarrierSaving] = useState(false);
  const [volumesInput, setVolumesInput] = useState(
    order != null && order.volumes != null ? String(order.volumes) : '',
  );
  const [savingVolumes, setSavingVolumes] = useState(false);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const lastSavedVolumesRef = useRef<number | null>(order?.volumes ?? null);
  const [volumesValid, setVolumesValid] = useState(
    order != null && order.volumes != null && order.volumes >= 1,
  );

  const isFinalized =
    order?.status === 'FINALIZADO' || order?.status === 'EXPEDIDO';
  const canEditVolumes = mode === 'separation' && !isFinalized;

  const saveVolumes = useCallback(
    async (value: number): Promise<boolean> => {
      if (!order || lastSavedVolumesRef.current === value || savingVolumes) {
        return lastSavedVolumesRef.current === value;
      }

      const numeroPed = numeroPedFromOrder(order);
      if (!numeroPed) {
        setVolumesError('Número do pedido inválido.');
        return false;
      }

      setSavingVolumes(true);
      setVolumesError(null);

      try {
        await erpFetchJson(pedidoApiUrl(numeroPed, 'volumes'), {
          method: 'PATCH',
          body: JSON.stringify({ volumes: value }),
        });
        lastSavedVolumesRef.current = value;
        setVolumesValid(true);
        onAfterAction?.();
        return true;
      } catch {
        setVolumesError('Não foi possível salvar os volumes.');
        return false;
      } finally {
        setSavingVolumes(false);
      }
    },
    [order, onAfterAction, savingVolumes],
  );

  const ensureVolumesSaved = useCallback(async (): Promise<boolean> => {
    const parsed = parseVolumesInput(volumesInput);
    if (parsed === null) return false;
    return saveVolumes(parsed);
  }, [saveVolumes, volumesInput]);

  useEffect(() => {
    setExitGenerated(false);
    setReadyForEtiqueta(false);
  }, [order?.id]);

  useEffect(() => {
    const initial = order?.volumes ?? null;
    setVolumesInput(initial != null ? String(initial) : '');
    lastSavedVolumesRef.current = initial;
    setVolumesValid(initial != null && initial >= 1);
    setVolumesError(null);
  }, [order?.id, order?.volumes]);

  useEffect(() => {
    if (!canEditVolumes) return;
    setVolumesValid(parseVolumesInput(volumesInput) !== null);
  }, [canEditVolumes, volumesInput]);

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
    const saved = await ensureVolumesSaved();
    if (!saved) {
      data.setToast({
        variant: 'err',
        message: 'Informe quantos volumes serão enviados (mínimo 1) antes de finalizar.',
      });
      return;
    }
    setConcluirModalOpen(true);
  };

  const handleImprimirEtiquetaAndExit = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      data.setToast({ variant: 'err', message: 'Número do pedido inválido.' });
      return;
    }

    setPrintingEtiqueta(true);
    try {
      const res = await fetch(`/api/erp/${pedidoApiUrl(numeroPed, 'etiqueta')}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text();
        let message = 'Não foi possível gerar a etiqueta.';
        try {
          const body = JSON.parse(text) as { message?: string | string[] };
          if (body.message) {
            message = Array.isArray(body.message)
              ? body.message.join(' · ')
              : body.message;
          }
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      const invoiceDigits = (order.invoiceNumber?.trim() ?? '')
        .split('/')[0]
        ?.replace(/\D/g, '');
      if (invoiceDigits) {
        await erpFetchJson(pedidoApiUrl(numeroPed, 'saida'), {
          method: 'POST',
          body: JSON.stringify({ invoiceNumber: invoiceDigits }),
        });
      } else {
        const ok = await data.attachRemessaExit(order.id);
        if (!ok) return;
      }

      setExitGenerated(true);
      await data.refreshAll();
      window.dispatchEvent(new Event('expedition-refresh'));
      onAfterAction?.();
      data.setToast({
        variant: 'ok',
        message: 'Etiqueta emitida e saída confirmada.',
      });
    } catch (err) {
      data.setToast({
        variant: 'err',
        message:
          err instanceof Error ? err.message : 'Falha ao imprimir etiqueta.',
      });
    } finally {
      setPrintingEtiqueta(false);
    }
  };

  const orderStatus = order.status as string;
  const canGenerateExit =
    order.status === 'SEPARADO' ||
    order.status === 'AGUARDANDO_NF' ||
    order.status === 'NF_ATRELADA';
  const canAttachNf =
    (order.status === 'SEPARADO' || order.status === 'AGUARDANDO_NF') &&
    !order.invoiceNumber?.trim();
  const canPrintEtiquetaAndExit =
    mode === 'separation' &&
    (order.status === 'NF_ATRELADA' ||
      readyForEtiqueta ||
      (Boolean(order.invoiceNumber?.trim()) &&
        order.status !== 'FINALIZADO' &&
        order.status !== 'EXPEDIDO'));
  const shouldShowNfAction = mode === 'separation' && canGenerateExit;
  const canRemessaExit =
    mode === 'separation' &&
    canGenerateExit &&
    Boolean(order.notaRemessa?.trim());
  const shouldShowConcludeAction = mode === 'separation' && !canGenerateExit && !exitGenerated;
  const shouldShowSaveAction = mode === 'separation' && !canGenerateExit && !exitGenerated;

  const canSendToSeparation =
    mode === 'orders' &&
    (orderStatus === 'NOVO' ||
      orderStatus === 'PENDENTE' ||
      (order.source === 'SITE' &&
        (orderStatus === 'PARCIAL' || orderStatus === 'RESERVADO')));
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
        order={order}
        panelMode={mode}
        isAdmin={isAdmin}
        hideVolumes={mode === 'separation'}
        onEditOrder={onEditOrder ? () => onEditOrder(order) : undefined}
        carrierSaving={carrierSaving}
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
        onStatusChanged={() => {
          void data.refreshAll();
          onAfterAction?.();
        }}
        onToggleUrgent={() => data.toggleOrderUrgent(order).then(() => onAfterAction?.())}
      />

      {canEditVolumes ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 px-3 py-2">
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            Volumes <span className="text-rose-400">*</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={volumesInput}
              onChange={(e) => {
                setVolumesInput(e.target.value);
                setVolumesError(null);
              }}
              onBlur={() => {
                const parsed = parseVolumesInput(volumesInput);
                if (parsed !== null) {
                  void saveVolumes(parsed);
                }
              }}
              disabled={savingVolumes}
              placeholder="Mín. 1"
              className="w-full max-w-[8rem] rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            {savingVolumes ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-secondary)]" />
            ) : null}
          </div>
          {volumesError ? (
            <p className="mt-1 text-xs text-red-500">{volumesError}</p>
          ) : shouldShowConcludeAction ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Obrigatório para finalizar a separação.
            </p>
          ) : null}
        </div>
      ) : mode === 'separation' && isFinalized ? (
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)]/40 px-3 py-2 text-sm text-[var(--text-primary)]">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Volumes: </span>
          {order.volumes != null && order.volumes >= 1
            ? `${order.volumes} volume${order.volumes > 1 ? 's' : ''}`
            : '—'}
        </div>
      ) : null}

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
              <>
                {canRemessaExit ? (
                  <button
                    type="button"
                    className="exp-wb-btn exp-wb-btn--success exp-wb-footer-main !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs"
                    onClick={() => {
                      void data.attachRemessaExit(order.id).then((ok) => {
                        if (ok) {
                          onAfterAction?.();
                        }
                      });
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Dar saída (Remessa)
                  </button>
                ) : null}
                {canAttachNf ? (
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
                {canPrintEtiquetaAndExit ? (
                  <button
                    type="button"
                    className="exp-wb-btn exp-wb-btn--primary exp-wb-footer-main !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={printingEtiqueta}
                    onClick={() => void handleImprimirEtiquetaAndExit()}
                  >
                    {printingEtiqueta ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Tag className="h-4 w-4" aria-hidden />
                    )}
                    Imprimir Etiqueta
                  </button>
                ) : null}
              </>
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
          setReadyForEtiqueta(true);
          await onAfterAction?.();
        }}
      />
    </div>
  );
}
