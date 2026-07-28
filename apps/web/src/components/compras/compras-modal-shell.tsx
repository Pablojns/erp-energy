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
      <div className="erp-modal-backdrop" aria-hidden />
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
