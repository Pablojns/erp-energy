'use client';

import { Check, ChevronDown } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

export type PremiumSelectOption = { value: string; label: string };

type PremiumSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  id?: string;
  /** Painel sobe em vez de descer (modais no rodapé) */
  placement?: 'above' | 'below';
  className?: string;
  disabled?: boolean;
};

export function PremiumSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  id,
  placement = 'below',
  className,
  disabled = false,
}: PremiumSelectProps) {
  const autoId = useId();
  const listId = `${id ?? autoId}-listbox`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className="erp-input erp-focus-ring flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selected ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
          }`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className={`erp-card absolute z-[130] max-h-56 min-w-full overflow-auto rounded-xl py-1.5 shadow-[var(--shadow-card)] erp-scrollbar ${
            placement === 'above'
              ? 'bottom-full mb-1.5 origin-bottom'
              : 'top-full mt-1.5 origin-top'
          }`}
        >
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onChange(opt.value);
                    close();
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition ${
                    isActive
                      ? 'bg-[#2AACE2]/12 text-[#1E96CC]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isActive ? (
                    <Check
                      className="h-3.5 w-3.5 shrink-0 text-[#2AACE2]"
                      aria-hidden
                    />
                  ) : (
                    <span className="inline-block w-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 leading-snug">{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
