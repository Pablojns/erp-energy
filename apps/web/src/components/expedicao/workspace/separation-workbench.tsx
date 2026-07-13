'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileText, Loader2, PackageOpen, Tag } from 'lucide-react';
import { MobileActionMenu, type MobileActionItem } from '@/src/components/mobile/mobile-action-menu';
import { isCorreiosCarrier } from '@/src/components/expedicao/shared/correios-carrier';
import { isWegItemAlreadyReceived, orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';
import { OrderInfoPanel } from '@/src/components/expedicao/workspace/order-info-panel';
import { ConcluirModal } from '@/src/components/expedicao/workspace/concluir-modal';
import { NfInputModal } from '@/src/components/expedicao/workspace/nf-input-modal';
import { SeparationStepper } from '@/src/components/expedicao/workspace/separation-stepper';
import { SeparationItemsTable } from '@/src/components/expedicao/workspace/separation-items-table';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import type { useExpeditionPedidosBridge } from '@/src/hooks/useExpeditionPedidosBridge';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizeInvoiceNumberDigits,
  numeroPedFromOrder,
  pedidoApiUrl,
} from '@/src/services/api/pedidos-normalize';

type OrdersData = ReturnType<typeof useExpeditionPedidosBridge>;

function parseVolumesInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

type GerarNfFlaskResponse = {
  success?: boolean;
  numeroNF?: string;
  numeroNota?: string;
  resultado?: { log?: string[] };
};

export function SeparationWorkbench(props: {
  order: OrderDto | null;
  data: OrdersData;
  mode?: 'orders' | 'separation';
  onAfterAction?: () => void;
  isAdmin?: boolean;
  onEditOrder?: (order: OrderDto) => void;
  onDeleteOrder?: (order: OrderDto) => void;
  mobileLayout?: boolean;
}) {
  const { order, data, mode = 'orders', onAfterAction, isAdmin = false, onEditOrder, onDeleteOrder, mobileLayout = false } = props;
  const [nfModalOpen, setNfModalOpen] = useState(false);
  const [nfFlaskModalOpen, setNfFlaskModalOpen] = useState(false);
  const [nfFlaskLoading, setNfFlaskLoading] = useState(false);
  const [nfFlaskLogs, setNfFlaskLogs] = useState<string[]>([]);
  const [nfFlaskError, setNfFlaskError] = useState<string | null>(null);
  const [nfFlaskSuccess, setNfFlaskSuccess] = useState<string | null>(null);
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
    setNfFlaskModalOpen(false);
  }, [order?.id]);

  useEffect(() => {
    if (mode !== 'separation' || !order) return;
    const awaitingNfWithoutInvoice =
      order.status === 'AGUARDANDO_NF' && !order.invoiceNumber?.trim();
    if (!awaitingNfWithoutInvoice) return;
    setNfFlaskModalOpen(true);
    setNfFlaskLoading(false);
    setNfFlaskLogs([]);
    setNfFlaskError(null);
    setNfFlaskSuccess(null);
  }, [mode, order?.id, order?.status, order?.invoiceNumber]);

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
      if (isWegItemAlreadyReceived(it)) {
        acc.complete += 1;
        return acc;
      }
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
  const finalLotStatus =
    itemCounts.pending === 0 && itemCounts.partial === 0 ? 'COMPLETO' : 'PARCIAL';
  const hasAnySeparatedQty = order.items.some(
    (it) => !isWegItemAlreadyReceived(it) && (it.pickedQty ?? 0) > 0,
  );
  const canFinalizeSeparation = hasAnySeparatedQty;

  const handleFinalizeSeparation = async () => {
    if (!hasAnySeparatedQty) {
      data.setToast({
        variant: 'err',
        message: 'Confirme ao menos um item com quantidade maior que zero antes de finalizar.',
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

  const openNfFlaskModal = () => {
    setNfFlaskModalOpen(true);
    setNfFlaskLoading(false);
    setNfFlaskLogs([]);
    setNfFlaskError(null);
    setNfFlaskSuccess(null);
  };

  const runGerarNfFlask = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      data.setToast({ variant: 'err', message: 'Número do pedido inválido.' });
      return;
    }

    setNfFlaskLoading(true);
    setNfFlaskLogs([]);
    setNfFlaskError(null);
    setNfFlaskSuccess(null);

    try {
      const res = await erpFetchJson<GerarNfFlaskResponse>(
        pedidoApiUrl(numeroPed, 'gerar-nf-flask'),
        { method: 'POST' },
      );

      const logs = Array.isArray(res.resultado?.log)
        ? res.resultado.log.map((line) => String(line))
        : [];

      if (logs.length === 0) {
        setNfFlaskLogs(['Aguardando retorno do robô…']);
      }

      for (let i = 0; i < logs.length; i += 1) {
        setNfFlaskLogs(logs.slice(0, i + 1));
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }

      const numeroNf = res.numeroNF ?? res.numeroNota;
      if (res.success && numeroNf) {
        setNfFlaskSuccess(numeroNf);
        setReadyForEtiqueta(true);
        await data.refreshAll();
        onAfterAction?.();
        data.setToast({
          variant: 'ok',
          message: `NF-e ${numeroNf} gerada e atrelada ao pedido.`,
        });
      } else {
        setNfFlaskError('Robô não retornou número da NF.');
      }
    } catch (err) {
      setNfFlaskError(
        err instanceof Error ? err.message : 'Falha ao gerar NF pelo robô.',
      );
    } finally {
      setNfFlaskLoading(false);
    }
  };

  const handleImprimirEtiquetaAndExit = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      data.setToast({ variant: 'err', message: 'Número do pedido inválido.' });
      return;
    }

    setPrintingEtiqueta(true);
    try {
      const useCorreiosEtiqueta = isCorreiosCarrier(order.carrierName);
      const etiquetaEndpoint = useCorreiosEtiqueta
        ? 'etiqueta-correios'
        : 'etiqueta';

      const res = await fetch(
        `/api/erp/${pedidoApiUrl(numeroPed, etiquetaEndpoint)}`,
        {
          credentials: 'include',
        },
      );
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

      const invoiceDigits = normalizeInvoiceNumberDigits(order.invoiceNumber);
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
  const canGerarNfFlask =
    mode === 'separation' &&
    (order.status === 'SEPARADO' ||
      order.status === 'AGUARDANDO_NF' ||
      orderStatus === 'NF_PENDENTE') &&
    !order.invoiceNumber?.trim();
  const canAttachNf = canGerarNfFlask;
  const hasInvoice = Boolean(order.invoiceNumber?.trim());
  const awaitingNfWithoutInvoice =
    order.status === 'AGUARDANDO_NF' && !hasInvoice;
  const canPrintEtiquetaAndExit =
    mode === 'separation' &&
    !awaitingNfWithoutInvoice &&
    hasInvoice &&
    (order.status === 'NF_ATRELADA' ||
      readyForEtiqueta ||
      (order.status !== 'FINALIZADO' && order.status !== 'EXPEDIDO'));
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
      orderStatus === 'PARCIAL' ||
      orderStatus === 'RESERVADO');
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

  const mobileActions: MobileActionItem[] = [];
  if (isAdmin && onEditOrder) {
    mobileActions.push({
      id: 'edit',
      label: 'Editar',
      onClick: () => onEditOrder(order),
    });
  }
  if (onDeleteOrder) {
    mobileActions.push({
      id: 'delete',
      label: 'Excluir',
      destructive: true,
      onClick: () => onDeleteOrder(order),
    });
  }
  if (canAttachNf) {
    mobileActions.push({
      id: 'gerar-nf',
      label: 'Gerar NF',
      onClick: () => openNfFlaskModal(),
      disabled: nfFlaskLoading,
    });
  }
  if (canPrintEtiquetaAndExit) {
    mobileActions.push({
      id: 'etiqueta',
      label: 'Imprimir Etiqueta',
      onClick: () => void handleImprimirEtiquetaAndExit(),
      disabled: printingEtiqueta,
    });
  }
  if (shouldShowSaveAction) {
    mobileActions.push({
      id: 'rascunho',
      label: 'Salvar Rascunho',
      onClick: () => {
        if (typeof data.saveSeparationProgress === 'function') {
          void data.saveSeparationProgress(order.id);
        } else {
          void data.refreshAll();
        }
      },
    });
  }
  if (canRemessaExit) {
    mobileActions.push({
      id: 'remessa',
      label: 'Dar saída (Remessa)',
      onClick: () => {
        void data.attachRemessaExit(order.id).then((ok) => {
          if (ok) onAfterAction?.();
        });
      },
    });
  }

  return (
    <div className="exp-wb-panel relative !gap-1.5 !p-3">
      {mobileLayout ? (
        <div className="fixed right-3 top-[calc(env(safe-area-inset-top)+70px)] z-[48] md:hidden">
          <MobileActionMenu actions={mobileActions} />
        </div>
      ) : null}
      <OrderInfoPanel
        order={order}
        panelMode={mode}
        isAdmin={isAdmin}
        hideVolumes={mode === 'separation'}
        compactHeaderActions={mobileLayout}
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
        <div className="exp-wb-triage exp-wb-triage--sticky !pt-2 hidden md:block">
          <button
            type="button"
            className="exp-wb-btn exp-wb-btn--primary exp-wb-btn--full exp-wb-send-separation"
            onClick={async () => {
              if (orderStatus === 'PARCIAL' || orderStatus === 'RESERVADO') {
                await data.sendToPicking(order.id);
              } else {
                await data.patchOrderStatus(order.id, 'EM_SEPARACAO');
                data.setToast({
                  variant: 'ok',
                  message: `Pedido #${numero} enviado para separação ✓`,
                });
              }
              onAfterAction?.();
            }}
          >
            → Enviar para separação
          </button>
        </div>
      ) : null}

      {mobileLayout && canSendToSeparation ? (
        <div className="exp-mobile-fixed-cta md:hidden">
          <button
            type="button"
            className="exp-mobile-fixed-cta-btn"
            onClick={async () => {
              if (orderStatus === 'PARCIAL' || orderStatus === 'RESERVADO') {
                await data.sendToPicking(order.id);
              } else {
                await data.patchOrderStatus(order.id, 'EM_SEPARACAO');
                data.setToast({
                  variant: 'ok',
                  message: `Pedido #${numero} enviado para separação ✓`,
                });
              }
              onAfterAction?.();
            }}
          >
            Enviar para Separação
          </button>
        </div>
      ) : null}

      {mode === 'separation' ? (
        <>
          <div className="exp-wb-footer-spacer min-[1025px]:hidden" />
          <footer className="exp-wb-footer !gap-2 !pt-2 hidden md:flex">
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
                      : 'Confirme ao menos um item com quantidade maior que zero'
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
                    className="exp-wb-btn exp-wb-btn--danger exp-wb-footer-main !min-h-0 !min-w-0 !px-3 !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={nfFlaskLoading}
                    onClick={() => openNfFlaskModal()}
                  >
                    {nfFlaskLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <FileText className="h-4 w-4" aria-hidden />
                    )}
                    Gerar NF
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
          {mobileLayout && shouldShowConcludeAction ? (
            <div className="exp-mobile-fixed-cta md:hidden">
              <button
                type="button"
                className="exp-mobile-fixed-cta-btn exp-mobile-fixed-cta-btn--success"
                disabled={concluding || !canFinalizeSeparation || !volumesValid}
                onClick={() => void handleFinalizeSeparation()}
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                Concluir Separação
              </button>
            </div>
          ) : null}
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
                if (!order.invoiceNumber?.trim()) {
                  openNfFlaskModal();
                }
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

      {nfFlaskModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4">
          <div
            className="flex w-full max-w-lg flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
            style={{ maxHeight: '90vh' }}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Gerar NF — Pedido #{numero}
            </h3>

            <div className="mt-3 min-h-[12rem] flex-1 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Log da automação
              </p>
              {nfFlaskLogs.length === 0 && !nfFlaskLoading ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  Clique em &quot;Gerar NF Automaticamente&quot; para iniciar o robô.
                </p>
              ) : nfFlaskLogs.length === 0 && nfFlaskLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processando…
                </div>
              ) : (
                <ul className="space-y-1.5 font-mono text-xs text-[var(--text-primary)]">
                  {nfFlaskLogs.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              )}
            </div>

            {nfFlaskSuccess ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                NF-e gerada: <strong>{nfFlaskSuccess}</strong>
              </p>
            ) : null}

            {nfFlaskError ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {nfFlaskError}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                className="text-sm font-medium text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline disabled:opacity-60"
                disabled={nfFlaskLoading}
                onClick={() => {
                  setNfFlaskModalOpen(false);
                  setNfModalOpen(true);
                }}
              >
                Inserir NF manualmente
              </button>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                  disabled={nfFlaskLoading}
                  onClick={() => setNfFlaskModalOpen(false)}
                >
                  Fechar
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
                  disabled={nfFlaskLoading}
                  onClick={() => void runGerarNfFlask()}
                >
                  {nfFlaskLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <FileText className="h-4 w-4" aria-hidden />
                  )}
                  Gerar NF Automaticamente
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
