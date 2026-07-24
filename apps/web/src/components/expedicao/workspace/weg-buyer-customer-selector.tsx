'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, UserPlus } from 'lucide-react';
import { digitsOnly } from '@/src/components/cadastros/document-mask';
import {
  QuickCustomerCreateModal,
  type QuickCustomerCreated,
} from '@/src/components/expedicao/workspace/quick-customer-create-modal';

export type WegBuyerCustomer = {
  id: string;
  name: string;
  isActive: boolean;
  cnpj?: string | null;
  deliveryAddress?: string | null;
};

function customerLabel(c: WegBuyerCustomer) {
  const doc = c.cnpj?.trim();
  return doc ? `${c.name} — ${doc}` : c.name;
}

export function WegBuyerCustomerSelector(props: {
  customers: WegBuyerCustomer[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (customer: WegBuyerCustomer) => void;
  onCreated: (customer: QuickCustomerCreated) => void;
  onBlur?: () => void;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  placeholder?: string;
  inputClassName?: string;
  /** z-index do dropdown (painel WEG usa z-50) */
  listZIndexClassName?: string;
}) {
  const {
    customers,
    value,
    onChange,
    onSelect,
    onCreated,
    onBlur,
    disabled,
    busy,
    error,
    placeholder = 'Digite nome ou CNPJ…',
    inputClassName,
    listZIndexClassName = 'z-50',
  } = props;

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const qDigits = digitsOnly(value);
    const active = customers.filter((c) => c.isActive);
    if (!q) return active.slice(0, 12);
    return active
      .filter((c) => {
        const name = c.name.toLowerCase();
        const cnpj = (c.cnpj ?? '').toLowerCase();
        const cnpjDigits = digitsOnly(c.cnpj ?? '');
        return (
          name.includes(q) ||
          cnpj.includes(q) ||
          (qDigits.length > 0 && cnpjDigits.includes(qDigits))
        );
      })
      .slice(0, 12);
  }, [customers, value]);

  const exactCnpjMatch = useMemo(() => {
    const qDigits = digitsOnly(value);
    if (qDigits.length < 11) return null;
    return (
      customers.find(
        (c) => c.isActive && digitsOnly(c.cnpj ?? '') === qDigits,
      ) ?? null
    );
  }, [customers, value]);

  const showCreateOption =
    value.trim().length > 0 && (filtered.length === 0 || !exactCnpjMatch);

  const defaultInputClass =
    'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 pr-8 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]';

  return (
    <>
      <div ref={wrapRef} className="relative z-20 w-full min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <input
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                window.setTimeout(() => {
                  if (wrapRef.current?.contains(document.activeElement)) return;
                  onBlur?.();
                }, 120);
              }}
              disabled={disabled || busy}
              placeholder={placeholder}
              className={inputClassName ?? defaultInputClass}
              aria-label="Comprador CNPJ"
              aria-autocomplete="list"
              aria-expanded={open}
              role="combobox"
              autoComplete="off"
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              aria-label="Mostrar clientes cadastrados"
              disabled={disabled || busy}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen((v) => !v);
              }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
          ) : null}
        </div>

        {open ? (
          <ul
            role="listbox"
            className={`absolute left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-lg ${listZIndexClassName}`}
          >
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
                Nenhum cliente encontrado.
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} role="option">
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-2.5 py-1.5 text-left hover:bg-[var(--input-bg)]"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelect(c);
                      setOpen(false);
                    }}
                  >
                    <span className="text-[12px] font-medium text-[var(--text-primary)]">
                      {c.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      {c.cnpj ?? '—'}
                    </span>
                  </button>
                </li>
              ))
            )}

            {showCreateOption ? (
              <li role="option" className="border-t border-[var(--border-color)]">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--input-bg)]"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setOpen(false);
                    setCreateOpen(true);
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" />
                  Cadastrar novo cliente
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {error ? (
          <span className="mt-1 block text-[11px] text-red-500">{error}</span>
        ) : null}
      </div>

      <QuickCustomerCreateModal
        open={createOpen}
        initialCnpj={digitsOnly(value).length >= 11 ? value : undefined}
        onClose={() => setCreateOpen(false)}
        onCreated={(customer) => {
          onCreated(customer);
          onSelect({
            id: customer.id,
            name: customer.name,
            cnpj: customer.cnpj ?? null,
            deliveryAddress: customer.deliveryAddress ?? null,
            isActive: customer.isActive ?? true,
          });
        }}
      />
    </>
  );
}

export { customerLabel as wegBuyerCustomerLabel };
