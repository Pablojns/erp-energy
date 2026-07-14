'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function ComprasModalShell(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const maxWidth =
    props.size === 'sm' ? 'max-w-md' : props.size === 'lg' ? 'max-w-4xl' : 'max-w-2xl';

  return (
    <div className="erp-modal-overlay">
      <button
        type="button"
        className="erp-modal-backdrop"
        onClick={props.onClose}
        aria-label="Fechar"
      />
      <section className={`erp-modal-panel relative ${maxWidth}`}>
        <button
          type="button"
          onClick={props.onClose}
          className="compras-close-btn"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div className="mb-3 pr-10 md:mb-4">
          <h2 className="text-base font-semibold text-[var(--erp-fg)] md:text-lg">{props.title}</h2>
        </div>
        {props.children}
      </section>
    </div>
  );
}

export function ComprasBadge(props: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'accent' | 'neutral' | 'danger';
}) {
  const tone = props.tone ?? 'neutral';
  return (
    <span className={`erp-badge erp-badge-${tone} inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset`}>
      {props.children}
    </span>
  );
}

export function ComprasDetailField(props: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={props.wide ? 'sm:col-span-2' : undefined}>
      <p className="erp-label-caps">{props.label}</p>
      <p className="mt-1 break-words rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)] px-3 py-2 text-sm text-[var(--erp-fg)]">
        {props.value}
      </p>
    </div>
  );
}
