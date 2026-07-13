'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import {
  formatOrderStatusLabel,
  orderDisplayNumber,
  resolveOrderWorkflowStatusBadge,
} from '@/src/components/expedicao/shared/order-helpers';
import {
  orderStatusDropdownBadgeStyle,
  orderWorkflowCardBadgeStyle,
} from '@/src/components/expedicao/shared/pedidos-status-styles';
import type { OrderDto, OrderStatus } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { numeroPedFromOrder, pedidoApiUrl } from '@/src/services/api/pedidos-normalize';

const MANUAL_STATUS_OPTIONS: Array<{ value: OrderStatus; label: string }> = [
  { value: 'NOVO', label: 'Novo' },
  { value: 'EM_SEPARACAO', label: 'Em Separação' },
  { value: 'AGUARDANDO_NF', label: 'Aguardando NF' },
  { value: 'FINALIZADO', label: 'Finalizado' },
  { value: 'PARCIAL', label: 'Parcial' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

export function OrderClickableStatusBadge(props: {
  order: OrderDto;
  onStatusChanged?: () => void;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const { order, onStatusChanged, readOnly = false, compact = false } = props;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const badge = resolveOrderWorkflowStatusBadge(order);
  const numero = orderDisplayNumber(order);
  const numeroPed = numeroPedFromOrder(order);

  useEffect(() => {
    setPending(null);
    setOpen(false);
    setError(null);
  }, [order.id, order.status]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleSelect = (value: OrderStatus) => {
    if (value === order.status) {
      setOpen(false);
      return;
    }
    setPending(value);
    setOpen(false);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!pending || !numeroPed) {
      setError('Número do pedido inválido para alteração de status.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await erpFetchJson(pedidoApiUrl(numeroPed, 'status'), {
        method: 'PATCH',
        body: JSON.stringify({ status: pending }),
      });
      setPending(null);
      onStatusChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao alterar status.');
    } finally {
      setSaving(false);
    }
  };

  const badgeClass = compact
    ? 'exp-wb-order-badge exp-pedidos-status-badge'
    : 'exp-wb-order-badge';

  if (readOnly) {
    return (
      <span
        className={badgeClass}
        style={orderWorkflowCardBadgeStyle(badge.color)}
      >
        {badge.label}
      </span>
    );
  }

  if (pending !== null) {
    const currentLabel = formatOrderStatusLabel(order.status);
    const nextLabel = formatOrderStatusLabel(pending);
    return (
      <div className="exp-order-status-confirm">
        <p className="exp-order-status-confirm-text">
          Você está alterando o status do pedido #{numero} de{' '}
          <strong>{currentLabel}</strong> para <strong>{nextLabel}</strong>. Confirmar?
        </p>
        <div className="exp-order-status-confirm-actions">
          <button
            type="button"
            className="exp-wb-btn exp-wb-btn--secondary px-2.5 py-1.5 text-xs"
            onClick={() => {
              setPending(null);
              setError(null);
            }}
            disabled={saving}
          >
            Voltar
          </button>
          <button
            type="button"
            className="exp-wb-btn exp-wb-btn--primary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs"
            onClick={() => void handleConfirm()}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirmar
          </button>
        </div>
        {error ? <p className="exp-order-status-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="exp-order-status-badge-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`${badgeClass} exp-order-status-badge-btn`}
        style={orderWorkflowCardBadgeStyle(badge.color)}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {badge.label}
        <ChevronDown
          className={compact ? 'exp-order-status-chevron !h-3 !w-3' : 'exp-order-status-chevron'}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="exp-order-status-dropdown" role="listbox">
          {MANUAL_STATUS_OPTIONS.map((opt) => {
            const isActive = order.status === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`exp-order-status-dropdown-item${isActive ? ' exp-order-status-dropdown-item--active' : ''}`}
                  style={orderStatusDropdownBadgeStyle(opt.value, isActive)}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
