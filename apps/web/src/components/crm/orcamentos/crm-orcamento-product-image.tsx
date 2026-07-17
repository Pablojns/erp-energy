'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

export function CrmOrcamentoProductImage(props: {
  src: string | null | undefined;
  alt?: string;
  /** Lista: 80px; detalhe: 120px */
  size?: 'list' | 'detail';
}) {
  const [open, setOpen] = useState(false);
  const sizeClass = props.size === 'detail' ? 'h-[120px] w-[120px]' : 'h-20 w-20';
  const src = props.src?.trim() || null;

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-[var(--erp-bg)] text-xs text-[var(--erp-fg-muted)] ${sizeClass}`}
      >
        —
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="erp-focus-ring block shrink-0 overflow-hidden rounded-md border border-[var(--erp-border)] bg-white p-0 transition hover:opacity-90"
        title="Ampliar imagem"
        aria-label="Ampliar imagem do produto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={props.alt ?? ''}
          className={`${sizeClass} object-cover`}
        />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80"
            onClick={() => setOpen(false)}
            aria-label="Fechar visualização"
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-[min(100%,500px)]">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-black/80 p-2 text-white hover:bg-black"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={props.alt ?? 'Visualização ampliada'}
              className="max-h-[85vh] w-full rounded-xl border border-white/20 bg-white object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
