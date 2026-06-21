'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
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
import { numeroPedFromOrder } from '@/src/services/api/pedidos-normalize';

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
    <div className="exp-wb-order-header-field">
      <span className="exp-wb-order-header-label">{label}</span>
      <div className="exp-wb-order-header-value">{children}</div>
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
      <span className="exp-wb-order-header-label">{label}:</span>
      <span className="exp-wb-order-header-value">{value}</span>
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
    onStatusChanged?: () => void;
    onToggleUrgent?: () => void | Promise<void>;
    showFinalizeVolumesHint?: boolean;
  }
>(function OrderInfoPanel(props, ref) {
  const {
    order,
    onCarrierChange,
    carrierSaving = false,
    onNotaRemessaSaved,
    onVolumesSaved,
    onVolumesValidityChange,
    onStatusChanged,
    onToggleUrgent,
    showFinalizeVolumesHint = false,
  } = props;

  const numero = orderDisplayNumber(order);
  const overdue = getOverdueDays(order);
  const urgent = order.priority <= 2;
  const cnpj = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const address = formatDeliveryAddressDisplay(order.deliveryAddress);
  const receiver = displayOrDash(order.receiverName);
  const point = displayOrDash(order.unloadingPoint);
  const notes = order.notes?.trim() || null;
  const notaVenda = order.invoiceNumber?.trim() || null;

  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [notaRemessa, setNotaRemessa] = useState(order.notaRemessa ?? '');
  const [savingNotaRemessa, setSavingNotaRemessa] = useState(false);
  const [notaRemessaError, setNotaRemessaError] = useState<string | null>(null);
  const lastSavedNotaRemessaRef = useRef(order.notaRemessa ?? '');

  const [volumesInput, setVolumesInput] = useState(
    order.volumes != null ? String(order.volumes) : '',
  );
  const [savingVolumes, setSavingVolumes] = useState(false);
  const [volumesError, setVolumesError] = useState<string | null>(null);
  const lastSavedVolumesRef = useRef<number | null>(order.volumes ?? null);

  useEffect(() => {
    const initial = order.notaRemessa ?? '';
    setNotaRemessa(initial);
    lastSavedNotaRemessaRef.current = initial;
    setNotaRemessaError(null);
  }, [order.id, order.notaRemessa]);

  useEffect(() => {
    const initial = order.volumes ?? null;
    setVolumesInput(initial != null ? String(initial) : '');
    lastSavedVolumesRef.current = initial;
    setVolumesError(null);
  }, [order.id, order.volumes]);

  useEffect(() => {
    onVolumesValidityChange?.(parseVolumesInput(volumesInput) !== null);
  }, [volumesInput, onVolumesValidityChange]);

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

  const saveNotaRemessa = async () => {
    const trimmed = notaRemessa.trim();
    const persisted = trimmed || null;
    const lastPersisted = lastSavedNotaRemessaRef.current.trim() || null;
    if (persisted === lastPersisted || savingNotaRemessa) return;

    const numeroPed = numeroPedFromOrder(order);
    if (!numeroPed) {
      setNotaRemessaError('Número do pedido inválido.');
      return;
    }

    setSavingNotaRemessa(true);
    setNotaRemessaError(null);
    const previous = lastSavedNotaRemessaRef.current;

    try {
      await erpFetchJson(`api/pedidos/${numeroPed}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ notaRemessa: trimmed }),
      });
      lastSavedNotaRemessaRef.current = trimmed;
      onNotaRemessaSaved?.(persisted);
    } catch {
      setNotaRemessa(previous);
      setNotaRemessaError('Não foi possível salvar.');
    } finally {
      setSavingNotaRemessa(false);
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
      await erpFetchJson(`api/pedidos/${numeroPed}/status`, {
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

  useImperativeHandle(ref, () => ({
    isVolumesValid: () => parseVolumesInput(volumesInput) !== null,
    ensureVolumesSaved: async () => {
      const parsed = parseVolumesInput(volumesInput);
      if (parsed === null) return false;
      return saveVolumes(parsed);
    },
  }));

  const inputClassName =
    'w-full min-w-0 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2.5 py-1.5 text-sm outline-none placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60 text-[var(--color-text-secondary,var(--text-secondary))]';

  return (
    <div className="exp-wb-section-card exp-wb-order-data-card exp-wb-order-data-card--blocks border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="exp-wb-order-header-meta">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="exp-wb-order-number m-0 shrink-0">#{numero}</p>
          <OrderClickableStatusBadge order={order} onStatusChanged={onStatusChanged} />
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
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
          <CalendarDays className="h-4 w-4 text-[var(--color-text-secondary,var(--text-secondary))]" aria-hidden />
          <span className="exp-wb-order-header-label">Entrega:</span>
          <span className="exp-wb-order-header-value">
            {order.requestedDeliveryDate
              ? formatDayDisplay(order.requestedDeliveryDate)
              : 'não informada'}
          </span>
          {overdue !== null ? (
            <span className="exp-wb-late-badge">{formatOverdueLabel(overdue)}</span>
          ) : null}
        </div>
      </div>

      <div className="exp-wb-order-header-body">
        <div className="exp-wb-order-header-block">
          <div className="exp-wb-order-header-row">
            <HeaderPair label="Comprador" value={cnpj} />
            <HeaderPair label="Endereço" value={address} align="end" />
          </div>
        </div>

        <div className="exp-wb-order-header-block">
          <div className="exp-wb-order-header-row">
            <HeaderPair label="Recebedor" value={receiver} />
            <HeaderPair label="Ponto de descarga" value={point} align="end" />
          </div>
        </div>

        <div className="exp-wb-order-header-block">
          <div className="exp-wb-order-header-obs">
            <span className="exp-wb-order-header-label">Observações:</span>
            <p
              className="exp-wb-order-header-value m-0 whitespace-pre-wrap"
              title={notes ?? undefined}
            >
              {notes ?? '—'}
            </p>
          </div>
        </div>

        <div className="exp-wb-order-header-block">
          <div className="exp-wb-order-header-grid">
          <HeaderField label="Transportadora:">
            {onCarrierChange ? (
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

          <HeaderField label="Volumes:">
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
          </HeaderField>

          <HeaderField label="Nota de Venda:">
            <span>{notaVenda ?? '—'}</span>
          </HeaderField>

          <HeaderField label="Nota de Remessa:">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={notaRemessa}
                onChange={(e) => {
                  setNotaRemessa(e.target.value);
                  setNotaRemessaError(null);
                }}
                onBlur={() => void saveNotaRemessa()}
                disabled={savingNotaRemessa}
                placeholder="Opcional"
                className={inputClassName}
              />
              {savingNotaRemessa ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
              ) : null}
            </div>
            {notaRemessaError ? (
              <p className="mt-1 text-xs text-red-500">{notaRemessaError}</p>
            ) : null}
          </HeaderField>
          </div>
        </div>
      </div>
    </div>
  );
});
