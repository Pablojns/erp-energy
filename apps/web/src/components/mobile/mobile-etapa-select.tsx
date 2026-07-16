'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2 } from 'lucide-react';

export type MobileEtapaOption = {
  id: string;
  label: string;
};

type MobileEtapaSelectProps = {
  label?: string;
  currentValue: string;
  options: MobileEtapaOption[];
  disabled?: boolean;
  saving?: boolean;
  /** compact = card do kanban; default = drawer */
  density?: 'compact' | 'default';
  emptyLabel?: string;
  onConfirm: (nextValue: string) => void | Promise<void>;
  className?: string;
  /** Evita abrir o card ao interagir (kanban) */
  stopPropagation?: boolean;
};

/**
 * Seletor de etapa mobile com confirmação:
 * muda a seleção (pendente) e só persiste ao clicar em Salvar "…".
 */
export function MobileEtapaSelect(props: MobileEtapaSelectProps) {
  const {
    label = 'Etapa atual',
    currentValue,
    options,
    disabled = false,
    saving = false,
    density = 'default',
    emptyLabel = 'Sem etapa',
    onConfirm,
    className = '',
    stopPropagation = false,
  } = props;

  const autoId = useId();
  const selectId = `mobile-etapa-${autoId}`;
  const [pendingValue, setPendingValue] = useState(currentValue);

  useEffect(() => {
    setPendingValue(currentValue);
  }, [currentValue]);

  const pendingOption = options.find((o) => o.id === pendingValue) ?? null;
  const hasPendingChange =
    Boolean(pendingValue) && pendingValue !== currentValue && Boolean(pendingOption);

  const compact = density === 'compact';

  const wrapProps = stopPropagation
    ? {
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
      }
    : {};

  const handleConfirm = async () => {
    if (!hasPendingChange || saving || disabled) return;
    await onConfirm(pendingValue);
  };

  return (
    <div className={`min-w-0 ${className}`} {...wrapProps}>
      <div className={`flex min-w-0 items-center gap-1 ${compact ? '' : 'flex-col items-stretch'}`}>
        {compact ? (
          <span className="shrink-0 text-[10px] font-semibold text-[var(--erp-fg-muted)]">
            {label}:
          </span>
        ) : (
          <label
            className="block text-xs font-semibold text-[var(--erp-fg-muted)]"
            htmlFor={selectId}
          >
            {label}
          </label>
        )}
        {compact ? (
          <label className="sr-only" htmlFor={selectId}>
            {label}
          </label>
        ) : null}
        <select
          id={selectId}
          value={pendingValue || ''}
          disabled={disabled || saving || (!currentValue && options.length === 0)}
          onChange={(e) => setPendingValue(e.target.value)}
          className={
            compact
              ? 'erp-crm-kanban-etapa-select min-w-0 flex-1 rounded-md border border-[var(--erp-border)] bg-[var(--erp-bg)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--erp-fg)] outline-none disabled:opacity-50'
              : 'mt-1.5 w-full rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)] px-3 py-2.5 text-sm font-semibold text-[var(--erp-fg)] outline-none disabled:opacity-50'
          }
          aria-label={`${label}: ${pendingOption?.label ?? emptyLabel}`}
        >
          {!currentValue && !pendingValue ? (
            <option value="">{emptyLabel}</option>
          ) : null}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {hasPendingChange ? (
        <button
          type="button"
          disabled={saving || disabled}
          onClick={() => void handleConfirm()}
          className={
            compact
              ? 'mt-1 inline-flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-60'
              : 'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60'
          }
          style={{ background: 'linear-gradient(to right, #2AACE2, #5BBFB0)' }}
        >
          {saving ? (
            <Loader2
              className={compact ? 'h-3 w-3 animate-spin' : 'h-4 w-4 animate-spin'}
              aria-hidden
            />
          ) : null}
          {`Salvar "${pendingOption?.label ?? ''}"`}
        </button>
      ) : null}
    </div>
  );
}
