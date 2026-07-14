'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Loader2, Pencil, Tag, Trash2 } from 'lucide-react';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import {
  displayOrDash,
  formatOverdueLabel,
  getOverdueDays,
  orderDisplayNumber,
} from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { OrderClickableStatusBadge } from '@/src/components/expedicao/workspace/order-clickable-status-badge';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';
import { isCorreiosCarrier } from '@/src/components/expedicao/shared/correios-carrier';

type CarrierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

function parseVolumesInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export type OrderInfoPanelHandle = {
  isVolumesValid: () => boolean;
  ensureVolumesSaved: () => Promise<boolean>;
};

function HeaderField(props: { label: string; children: ReactNode }) {
  const { label, children } = props;
  return (
    <div className="exp-wb-order-header-field gap-0.5">
      <span className="exp-wb-order-header-label">{label}</span>
      <div className="exp-wb-order-header-value">{children}</div>
    </div>
  );
}

function PartyCell(props: {
  label: string;
  value: string;
  copyValue?: string;
  multiline?: boolean;
}) {
  const { label, value, copyValue, multiline = false } = props;
  return (
    <div
      className={`exp-wb-order-party-cell${multiline ? ' exp-wb-order-party-cell--wrap' : ''}`}
    >
      <span className="exp-wb-order-party-label">{label}</span>
      <div className="exp-wb-order-party-value-row min-w-0">
        <span
          className={`exp-wb-order-party-value${
            multiline
              ? ' exp-wb-order-party-value--wrap'
              : copyValue
                ? ' exp-wb-order-party-value--ellipsis'
                : ''
          }`}
          title={multiline ? undefined : value}
        >
          {value}
        </span>
        {copyValue && !multiline ? (
          <button
            type="button"
            className="exp-wb-order-party-copy"
            aria-label="Copiar endereço"
            title="Copiar endereço"
            onClick={() => void navigator.clipboard.writeText(copyValue)}
          >
            📋
          </button>
        ) : null}
      </div>
    </div>
  );
}

export const OrderInfoPanel = forwardRef<
  OrderInfoPanelHandle,
  {
    order: OrderDto;
    onCarrierChange?: (carrierId: string | null) => void | Promise<void>;
    carrierSaving?: boolean;
    onNotaRemessaSaved?: (value: string | null) => void;
    onVolumesSaved?: () => void;
    onVolumesValidityChange?: (valid: boolean) => void;
    hideVolumes?: boolean;
    onStatusChanged?: () => void;
    onToggleUrgent?: () => void | Promise<void>;
    showFinalizeVolumesHint?: boolean;
    panelMode?: 'orders' | 'separation';
    isAdmin?: boolean;
    onEditOrder?: () => void;
    compactHeaderActions?: boolean;
    /** Slot mobile (ex.: menu ⋮) alinhado à direita da linha do número/status. */
    headerTrailing?: ReactNode;
  }
>(function OrderInfoPanel(props, ref) {
  const {
    order,
    onCarrierChange,
    carrierSaving = false,
    onNotaRemessaSaved,
    onVolumesSaved,
    onVolumesValidityChange,
    hideVolumes = false,
    onStatusChanged,
    onToggleUrgent,
    showFinalizeVolumesHint = false,
    panelMode = 'separation',
    isAdmin = false,
    onEditOrder,
    compactHeaderActions = false,
    headerTrailing,
  } = props;

  const isOrdersMode = panelMode === 'orders';
  const isSiteOrder = order.source === 'SITE';
  const isVendaExternaOrder = order.source === 'VENDA_EXTERNA';
  const isSimpleCustomerLayout = isSiteOrder || isVendaExternaOrder;

  const numero = orderDisplayNumber(order);
  const overdue = getOverdueDays(order);
  const urgent = order.priority <= 2;
  const cnpj = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const address = formatDeliveryAddressDisplay(order.deliveryAddress);
  const receiver = displayOrDash(order.receiverName);
  const point = displayOrDash(order.unloadingPoint);
  const notes = order.notes?.trim() || null;
  const notaVenda = order.invoiceNumber?.trim() || null;
  const isFinalized =
    order.status === 'FINALIZADO' || order.status === 'EXPEDIDO';
  const carrierLocked = Boolean(order.carrierId?.trim());
  const fieldsReadOnly = isFinalized;

  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [notaRemessa, setNotaRemessa] = useState(order.notaRemessa ?? '');
  const [notaVendaInput, setNotaVendaInput] = useState(order.invoiceNumber ?? '');
  const [notaRemessaConfirmada, setNotaRemessaConfirmada] = useState(
    order.notaRemessaConfirmada ?? false,
  );
  const [savingNotaRemessa, setSavingNotaRemessa] = useState(false);
  const [savingNotaVenda, setSavingNotaVenda] = useState(false);
  const [notaRemessaError, setNotaRemessaError] = useState<string | null>(null);
  const [notaVendaError, setNotaVendaError] = useState<string | null>(null);
  const lastSavedNotaRemessaRef = useRef(order.notaRemessa ?? '');
  const lastSavedNotaRemessaConfirmadaRef = useRef(order.notaRemessaConfirmada ?? false);
  const lastSavedNotaVendaRef = useRef(order.invoiceNumber ?? '');

  const [volumesInput, setVolumesInput] = useState(
    order.volumes != null ? String(order.volumes) : '',
  );
  const [savingVolumes, setSavingVolumes] = useState(false);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const lastSavedVolumesRef = useRef<number | null>(order.volumes ?? null);
  const [emittingEtiqueta, setEmittingEtiqueta] = useState(false);
  const [cancellingEtiqueta, setCancellingEtiqueta] = useState(false);
  const [etiquetaError, setEtiquetaError] = useState<string | null>(null);
  const [trackingCodeInput, setTrackingCodeInput] = useState(order.trackingCode ?? '');
  const [savingTrackingCode, setSavingTrackingCode] = useState(false);
  const [trackingCodeError, setTrackingCodeError] = useState<string | null>(null);
  const lastSavedTrackingCodeRef = useRef(order.trackingCode ?? '');

  const canEmitEtiqueta = order.status === 'FINALIZADO';
  const isCorreiosOrder = isCorreiosCarrier(order.carrierName);
  const canCancelCorreiosEtiqueta =
    isCorreiosOrder && Boolean(order.trackingCode?.trim());
  const canEditTrackingCode = order.status === 'FINALIZADO';

  useEffect(() => {
    const initial = order.notaRemessa ?? '';
    const confirmed = order.notaRemessaConfirmada ?? false;
    const invoice = order.invoiceNumber ?? '';
    setNotaRemessa(initial);
    setNotaVendaInput(invoice);
    setNotaRemessaConfirmada(confirmed);
    lastSavedNotaRemessaRef.current = initial;
    lastSavedNotaRemessaConfirmadaRef.current = confirmed;
    lastSavedNotaVendaRef.current = invoice;
    setNotaRemessaError(null);
    setNotaVendaError(null);
  }, [order.id, order.notaRemessa, order.notaRemessaConfirmada, order.invoiceNumber]);

  useEffect(() => {
    const initial = order.volumes ?? null;
    setVolumesInput(initial != null ? String(initial) : '');
    lastSavedVolumesRef.current = initial;
    setVolumesError(null);
  }, [order.id, order.volumes]);

  useEffect(() => {
    const initial = order.trackingCode ?? '';
    setTrackingCodeInput(initial);
    lastSavedTrackingCodeRef.current = initial;
    setTrackingCodeError(null);
  }, [order.id, order.trackingCode]);

  useEffect(() => {
    if (isOrdersMode) return;
    onVolumesValidityChange?.(parseVolumesInput(volumesInput) !== null);
  }, [volumesInput, onVolumesValidityChange, isOrdersMode]);

  useEffect(() => {
    let cancelled = false;
    setCarriersLoading(true);
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => {
        if (!cancelled) {
          setCarriers(rows.filter((c) => c.isActive));
        }
      })
      .catch(() => {
        if (!cancelled) setCarriers([]);
      })
      .finally(() => {
        if (!cancelled) setCarriersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const carrierOptions = [
    { value: '', label: '— Selecionar —' },
    ...carriers.map((c) => ({ value: c.id, label: c.name })),
  ];

  const saveNotaRemessa = async (opts?: { confirmed?: boolean }) => {
    const trimmed = notaRemessa.trim();
    const confirmed = opts?.confirmed ?? notaRemessaConfirmada;
    const persisted = trimmed || null;
    const lastPersisted = lastSavedNotaRemessaRef.current.trim() || null;
    const lastConfirmed = lastSavedNotaRemessaConfirmadaRef.current;

    if (confirmed && !trimmed) {
      setNotaRemessaError('Informe o número da nota de remessa para confirmar.');
      return;
    }

    if (persisted === lastPersisted && confirmed === lastConfirmed && !savingNotaRemessa) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNotaRemessaError('Número do pedido inválido.');
      return;
    }

    setSavingNotaRemessa(true);
    setNotaRemessaError(null);
    const previous = lastSavedNotaRemessaRef.current;
    const previousConfirmed = lastSavedNotaRemessaConfirmadaRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({
          notaRemessa: trimmed,
          notaRemessaConfirmada: confirmed,
        }),
      });
      lastSavedNotaRemessaRef.current = trimmed;
      lastSavedNotaRemessaConfirmadaRef.current = confirmed;
      onNotaRemessaSaved?.(persisted);
    } catch {
      setNotaRemessa(previous);
      setNotaRemessaConfirmada(previousConfirmed);
      setNotaRemessaError('Não foi possível salvar.');
    } finally {
      setSavingNotaRemessa(false);
    }
  };

  const saveNotaVenda = async () => {
    const trimmed = notaVendaInput.trim();
    const persisted = trimmed || null;
    const lastPersisted = lastSavedNotaVendaRef.current.trim() || null;

    if (persisted === lastPersisted && !savingNotaVenda) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNotaVendaError('Número do pedido inválido.');
      return;
    }

    setSavingNotaVenda(true);
    setNotaVendaError(null);
    const previous = lastSavedNotaVendaRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({ invoiceNumber: trimmed }),
      });
      lastSavedNotaVendaRef.current = trimmed;
      onNotaRemessaSaved?.(persisted);
    } catch {
      setNotaVendaInput(previous);
      setNotaVendaError('Não foi possível salvar.');
    } finally {
      setSavingNotaVenda(false);
    }
  };

  const saveVolumes = async (value: number): Promise<boolean> => {
    if (lastSavedVolumesRef.current === value || savingVolumes) return true;

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
      onVolumesSaved?.();
      return true;
    } catch {
      setVolumesError('Não foi possível salvar os volumes.');
      return false;
    } finally {
      setSavingVolumes(false);
    }
  };

  const saveTrackingCode = async () => {
    const trimmed = trackingCodeInput.trim();
    const lastPersisted = lastSavedTrackingCodeRef.current.trim();

    if (trimmed === lastPersisted && !savingTrackingCode) {
      return;
    }

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setTrackingCodeError('Número do pedido inválido.');
      return;
    }

    setSavingTrackingCode(true);
    setTrackingCodeError(null);
    const previous = lastSavedTrackingCodeRef.current;

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'rastreio'), {
        method: 'PATCH',
        body: JSON.stringify({ trackingCode: trimmed }),
      });
      lastSavedTrackingCodeRef.current = trimmed;
      setTrackingCodeInput(trimmed);
      onStatusChanged?.();
    } catch {
      setTrackingCodeInput(previous);
      setTrackingCodeError('Não foi possível salvar o código de rastreio.');
    } finally {
      setSavingTrackingCode(false);
    }
  };

  const handleEmitEtiqueta = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    setEmittingEtiqueta(true);
    setEtiquetaError(null);

    try {
      const etiquetaEndpoint = isCorreiosOrder ? 'etiqueta-correios' : 'etiqueta';
      const res = await fetch(`/api/erp/${pedidoApiUrl(numeroPed, etiquetaEndpoint)}`, {
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
      onStatusChanged?.();
    } catch (err) {
      setEtiquetaError(
        err instanceof Error ? err.message : 'Não foi possível gerar a etiqueta.',
      );
    } finally {
      setEmittingEtiqueta(false);
    }
  };

  const handleCancelCorreiosEtiqueta = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    const tracking = order.trackingCode?.trim();
    if (!tracking) return;

    const confirmed = window.confirm(
      `Cancelar a etiqueta Correios ${tracking}?\n\nA pré-postagem será cancelada no site dos Correios e o código de rastreio será removido do pedido.`,
    );
    if (!confirmed) return;

    setCancellingEtiqueta(true);
    setEtiquetaError(null);

    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'etiqueta-correios'), {
        method: 'DELETE',
      });
      setTrackingCodeInput('');
      lastSavedTrackingCodeRef.current = '';
      onStatusChanged?.();
    } catch (err) {
      setEtiquetaError(
        err instanceof Error
          ? err.message
          : 'Não foi possível cancelar a etiqueta Correios.',
      );
    } finally {
      setCancellingEtiqueta(false);
    }
  };

  useImperativeHandle(ref, () => ({
    isVolumesValid: () => parseVolumesInput(volumesInput) !== null,
    ensureVolumesSaved: async () => {
      const parsed = parseVolumesInput(volumesInput);
      if (parsed === null) return false;
      return saveVolumes(parsed);
    },
  }));

  const inputClassName =
    'exp-wb-transport-input w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 text-[12px] outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-default disabled:opacity-60 text-[var(--color-text-secondary,var(--text-secondary))]';

  return (
    <div className="exp-wb-section-card exp-wb-order-data-card exp-wb-order-data-card--blocks !gap-1.5 !p-3">
      {order.linkedOrderId && order.source === 'WEG_MERCADO_ELETRONICO' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Este pedido já foi enviado via saída urgente. Apenas emita a NF.
          {order.linkedOrderDisplayNumber ? (
            <span className="mt-1 block text-amber-700">
              Referência urgente: #{order.linkedOrderDisplayNumber}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="exp-wb-order-header-meta">
        <div className="pedido-header-row1 exp-wb-order-header-meta--row">
          <p className="pedido-numero exp-wb-order-number m-0 shrink-0 text-[13px] font-semibold">
            #{numero}
          </p>
          <div className="pedido-status-badge shrink-0">
            <OrderClickableStatusBadge
              order={order}
              onStatusChanged={onStatusChanged}
              readOnly={fieldsReadOnly}
            />
          </div>
          {headerTrailing ? (
            <div className="pedido-menu-btn ml-auto shrink-0 md:hidden">{headerTrailing}</div>
          ) : null}
          <div className="pedido-entrega exp-wb-order-header-delivery exp-wb-order-header-delivery--inline ml-auto min-w-0">
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-secondary,var(--text-secondary))]"
              aria-hidden
            />
            <span className="exp-wb-order-header-label">Entrega:</span>
            <span className="exp-wb-order-header-value">
              {order.requestedDeliveryDate
                ? formatDayDisplay(order.requestedDeliveryDate)
                : 'não informada'}
            </span>
            {overdue !== null ? (
              <span className="badge-atrasado exp-wb-late-badge shrink-0">
                {formatOverdueLabel(overdue)}
              </span>
            ) : null}
          </div>
          <div
            className={`exp-wb-order-header-actions${compactHeaderActions ? ' hidden md:flex' : ''}`}
          >
            {onToggleUrgent ? (
              urgent ? (
                <button
                  type="button"
                  className="exp-wb-order-badge exp-wb-order-badge--urgent exp-wb-order-badge--pulse"
                  onClick={() => void onToggleUrgent()}
                >
                  Urgente
                </button>
              ) : (
                <button
                  type="button"
                  className="exp-wb-urgency-toggle text-[12px]"
                  onClick={() => void onToggleUrgent()}
                >
                  Marcar urgente
                </button>
              )
            ) : urgent ? (
              <span className="exp-wb-order-badge exp-wb-order-badge--urgent exp-wb-order-badge--pulse">
                Urgente
              </span>
            ) : null}
            {isAdmin && onEditOrder ? (
              <button
                type="button"
                className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px]"
                onClick={onEditOrder}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            ) : null}
            {canEmitEtiqueta ? (
              <button
                type="button"
                className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handleEmitEtiqueta()}
                disabled={emittingEtiqueta || cancellingEtiqueta}
              >
                {emittingEtiqueta ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Tag className="h-3.5 w-3.5" />
                )}
                Etiqueta
              </button>
            ) : null}
            {canCancelCorreiosEtiqueta ? (
              <button
                type="button"
                className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-[12px] text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handleCancelCorreiosEtiqueta()}
                disabled={cancellingEtiqueta || emittingEtiqueta}
              >
                {cancellingEtiqueta ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Cancelar
              </button>
            ) : null}
          </div>
          {etiquetaError ? (
            <p className="exp-wb-order-header-error text-[12px] text-red-500">{etiquetaError}</p>
          ) : null}
        </div>
        <div className="pedido-header-row2 pedido-entrega exp-wb-order-header-delivery--mobile md:hidden">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Entrega:</span>
          <span>
            {order.requestedDeliveryDate
              ? formatDayDisplay(order.requestedDeliveryDate)
              : 'não informada'}
          </span>
          {overdue !== null ? (
            <span className="badge-atrasado exp-wb-late-badge shrink-0">
              {formatOverdueLabel(overdue)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="exp-wb-order-header-body">
        <div className="exp-wb-order-parties-grid">
          {isSimpleCustomerLayout ? (
            <>
              <PartyCell label="Cliente" value={displayOrDash(order.customerName)} />
              <PartyCell
                label="Endereço"
                value={formatDeliveryAddressDisplay(
                  order.deliveryAddress ?? order.unloadingPoint,
                )}
                multiline
              />
              <PartyCell label="Recebedor" value={receiver} />
              <PartyCell label="Ponto de descarga" value={point} />
            </>
          ) : (
            <>
              <PartyCell label="Comprador" value={cnpj} />
              <PartyCell label="Endereço" value={address} multiline />
              <PartyCell label="Recebedor" value={receiver} />
              <PartyCell label="Ponto de descarga" value={point} />
            </>
          )}
        </div>

        <div className="exp-wb-order-obs-compact" title={notes ?? undefined}>
          <span className="exp-wb-order-obs-icon" aria-hidden>
            📝
          </span>
          <span className="exp-wb-order-obs-text">{notes ?? '—'}</span>
        </div>

        <div className="exp-wb-order-header-block exp-wb-order-header-block--transport !p-2">
          <div className="exp-wb-transport-grid">
            <HeaderField label="Transportadora:">
              {onCarrierChange && !carrierLocked && !fieldsReadOnly ? (
                <div className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <PremiumSelect
                      value={order.carrierId ?? ''}
                      onChange={(value) => {
                        void onCarrierChange(value.trim() ? value : null);
                      }}
                      options={carrierOptions}
                      placeholder="Selecionar…"
                      disabled={carrierSaving || carriersLoading}
                    />
                  </div>
                  {carrierSaving || carriersLoading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                  ) : null}
                </div>
              ) : (
                <span>{displayOrDash(order.carrierName)}</span>
              )}
            </HeaderField>

            {!hideVolumes && !isSimpleCustomerLayout ? (
              <HeaderField label="Volumes:">
                {isOrdersMode || fieldsReadOnly ? (
                  <span>
                    {order.volumes != null && order.volumes >= 1
                      ? `${order.volumes} volume${order.volumes > 1 ? 's' : ''}`
                      : '—'}
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
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
                        className={inputClassName}
                      />
                      {savingVolumes ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                      ) : null}
                    </div>
                    {volumesError ? (
                      <p className="mt-1 text-xs text-red-500">{volumesError}</p>
                    ) : showFinalizeVolumesHint ? (
                      <p className="mt-1 text-xs text-[var(--color-text-secondary,var(--text-secondary))]">
                        Obrigatório para finalizar.
                      </p>
                    ) : null}
                  </>
                )}
              </HeaderField>
            ) : null}

            <HeaderField label="Nota de Venda (NF):">
              {fieldsReadOnly ? (
                <span>{notaVenda ?? '—'}</span>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={notaVendaInput}
                      onChange={(e) => {
                        setNotaVendaInput(e.target.value);
                        setNotaVendaError(null);
                      }}
                      onBlur={() => void saveNotaVenda()}
                      disabled={savingNotaVenda}
                      placeholder="NF oficial (opcional)"
                      className={inputClassName}
                    />
                    {savingNotaVenda ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
                    ) : null}
                  </div>
                  {notaVendaError ? (
                    <p className="mt-1 text-xs text-red-500">{notaVendaError}</p>
                  ) : null}
                </>
              )}
            </HeaderField>

            {canEditTrackingCode ? (
              <HeaderField label="Código de Rastreio:">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={trackingCodeInput}
                    onChange={(e) => {
                      setTrackingCodeInput(e.target.value);
                      setTrackingCodeError(null);
                    }}
                    disabled={savingTrackingCode}
                    placeholder="Digite o código"
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border-color)] px-2 py-1.5 text-xs font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void saveTrackingCode()}
                    disabled={savingTrackingCode}
                  >
                    {savingTrackingCode ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      'Salvar'
                    )}
                  </button>
                </div>
                {trackingCodeError ? (
                  <p className="mt-1 text-xs text-red-500">{trackingCodeError}</p>
                ) : null}
              </HeaderField>
            ) : null}

            {!isSiteOrder ? (
              <HeaderField label="Nota de Remessa:">
                {fieldsReadOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{notaRemessa.trim() || '—'}</span>
                    {order.notaRemessaConfirmada ? (
                      <span className="exp-wb-line-status exp-wb-line-status--recebido">
                        Confirmada
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={notaRemessa}
                      onChange={(e) => {
                        setNotaRemessa(e.target.value);
                        setNotaRemessaError(null);
                      }}
                      onBlur={() => void saveNotaRemessa()}
                      disabled={savingNotaRemessa}
                      placeholder="Número da remessa"
                      className={inputClassName}
                    />
                    {savingNotaRemessa ? (
                      <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                    ) : null}
                    {notaRemessaError ? (
                      <p className="mt-1 text-[12px] text-red-500">{notaRemessaError}</p>
                    ) : null}
                  </>
                )}
              </HeaderField>
            ) : null}
          </div>
          {!isSiteOrder && !fieldsReadOnly ? (
            <label className="exp-wb-remessa-confirm">
              <input
                type="checkbox"
                checked={notaRemessaConfirmada}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setNotaRemessaConfirmada(checked);
                  void saveNotaRemessa({ confirmed: checked });
                }}
                disabled={savingNotaRemessa}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              Confirmar nota de remessa
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
});
