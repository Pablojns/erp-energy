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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65"
        onClick={props.onClose}
        aria-label="Fechar"
      />
      <section
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#111521] p-5 shadow-2xl ${maxWidth}`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{props.title}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {props.children}
      </section>
    </div>
  );
}

export function ComprasBadge(props: { children: ReactNode; className: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${props.className}`}
    >
      {props.children}
    </span>
  );
}

export function ComprasDetailField(props: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={props.wide ? 'sm:col-span-2' : undefined}>
      <p className="text-xs font-medium uppercase tracking-wide text-white/40">{props.label}</p>
      <p className="mt-1 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white">
        {props.value}
      </p>
    </div>
  );
}
