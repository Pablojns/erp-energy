'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Loader2, Pencil, Tag } from 'lucide-react';
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
    <div className="exp-wb-order-header-field gap-1">
      <span className="exp-wb-order-header-label text-xs text-zinc-400">{label}</span>
      <div className="exp-wb-order-header-value text-sm">{children}</div>
    </div>
  );
}

function HeaderPair(props: {
  label: string;
  value: string;
  align?: 'start' | 'end';
}) {
  const { label, value, align = 'start' } = props;
  return (
    <div
      className={`exp-wb-order-header-pair${align === 'end' ? ' exp-wb-order-header-pair--end' : ''}`}
    >
      <span className="exp-wb-order-header-label text-xs text-zinc-400">{label}:</span>
      <span className="exp-wb-order-header-value text-sm">{value}</span>
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
  } = props;

  const isOrdersMode = panelMode === 'orders';
  const isSiteOrder = order.source === 'SITE';

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
  const [etiquetaError, setEtiquetaError] = useState<string | null>(null);

  const canEmitEtiqueta = order.status === 'FINALIZADO';

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

  const handleEmitEtiqueta = async () => {
    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setEtiquetaError('Número do pedido inválido.');
      return;
    }

    setEmittingEtiqueta(true);
    setEtiquetaError(null);

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
    } catch (err) {
      setEtiquetaError(
        err instanceof Error ? err.message : 'Não foi possível gerar a etiqueta.',
      );
    } finally {
      setEmittingEtiqueta(false);
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
    'w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1.5 text-xs outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] disabled:cursor-default disabled:opacity-60 text-[var(--color-text-secondary,var(--text-secondary))]';

  return (
    <div className="exp-wb-section-card exp-wb-order-data-card exp-wb-order-data-card--blocks !gap-1.5 !p-3">
      {order.linkedOrderId && order.source === 'WEG_MERCADO_ELETRONICO' ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Este pedido já foi enviado via saída urgente. Apenas emita a NF.
          {order.linkedOrderDisplayNumber ? (
            <span className="mt-1 block text-amber-300/90">
              Referência urgente: #{order.linkedOrderDisplayNumber}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="exp-wb-order-header-meta !gap-2 !py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="exp-wb-order-number m-0 shrink-0 text-sm font-semibold">#{numero}</p>
          <OrderClickableStatusBadge
            order={order}
            onStatusChanged={onStatusChanged}
            readOnly={fieldsReadOnly}
          />
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
                className="exp-wb-urgency-toggle text-xs"
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
              className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-xs"
              onClick={onEditOrder}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar pedido
            </button>
          ) : null}
          {canEmitEtiqueta ? (
            <button
              type="button"
              className="exp-wb-urgency-toggle inline-flex items-center gap-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleEmitEtiqueta()}
              disabled={emittingEtiqueta}
            >
              {emittingEtiqueta ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Tag className="h-3.5 w-3.5" />
              )}
              Imprimir Etiqueta
            </button>
          ) : null}
          {etiquetaError ? (
            <p className="basis-full text-xs text-red-500">{etiquetaError}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
          <CalendarDays className="h-3.5 w-3.5 text-[var(--color-text-secondary,var(--text-secondary))]" aria-hidden />
          <span className="exp-wb-order-header-label text-xs text-zinc-400">Entrega:</span>
          <span className="exp-wb-order-header-value text-sm">
            {order.requestedDeliveryDate
              ? formatDayDisplay(order.requestedDeliveryDate)
              : 'não informada'}
          </span>
          {overdue !== null ? (
            <span className="exp-wb-late-badge">{formatOverdueLabel(overdue)}</span>
          ) : null}
        </div>
      </div>

      <div className="exp-wb-order-header-body !mt-1.5 !gap-1.5">
        {isSiteOrder ? (
          <div className="exp-wb-order-header-block !p-3">
            <div className="exp-wb-order-header-row !gap-2">
              <HeaderPair label="Cliente" value={displayOrDash(order.customerName)} />
              <HeaderPair
                label="Endereço"
                value={formatDeliveryAddressDisplay(
                  order.deliveryAddress ?? order.unloadingPoint,
                )}
                align="end"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="exp-wb-order-header-block !p-3">
              <div className="exp-wb-order-header-row !gap-2">
                <HeaderPair label="Comprador" value={cnpj} />
                <HeaderPair label="Endereço" value={address} align="end" />
              </div>
            </div>

            <div className="exp-wb-order-header-block !p-3">
              <div className="exp-wb-order-header-row !gap-2">
                <HeaderPair label="Recebedor" value={receiver} />
                <HeaderPair label="Ponto de descarga" value={point} align="end" />
              </div>
            </div>
          </>
        )}

        <div className="exp-wb-order-header-block !p-3">
          <div className="exp-wb-order-header-obs gap-1">
            <span className="exp-wb-order-header-label text-xs text-zinc-400">Observações:</span>
            <p
              className="exp-wb-order-header-value m-0 whitespace-pre-wrap text-sm"
              title={notes ?? undefined}
            >
              {notes ?? '—'}
            </p>
          </div>
        </div>

        <div className="exp-wb-order-header-block !p-3">
          <div className="exp-wb-order-header-grid !gap-2">
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

            {!hideVolumes && !isSiteOrder ? (
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
                    <div className="flex flex-col gap-1.5">
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
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={notaRemessaConfirmada}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNotaRemessaConfirmada(checked);
                            void saveNotaRemessa({ confirmed: checked });
                          }}
                          disabled={savingNotaRemessa}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        Confirmar nota de remessa
                      </label>
                    </div>
                    {savingNotaRemessa ? (
                      <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-[var(--text-secondary)]" />
                    ) : null}
                    {notaRemessaError ? (
                      <p className="mt-1 text-xs text-red-500">{notaRemessaError}</p>
                    ) : null}
                  </>
                )}
              </HeaderField>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
