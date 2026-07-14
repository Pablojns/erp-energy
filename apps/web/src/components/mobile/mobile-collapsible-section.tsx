'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function MobileCollapsibleSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  /** No mobile, sempre mostra o conteúdo (sem seta/expandir). Desktop inalterado. */
  mobileAlwaysOpen?: boolean;
  /** Classe extra aplicada ao card mobile (ex.: variante Financeiro). */
  mobileCardClassName?: string;
}) {
  const {
    title,
    defaultOpen = true,
    children,
    mobileAlwaysOpen = false,
    mobileCardClassName = '',
  } = props;
  const [open, setOpen] = useState(defaultOpen);

  if (mobileAlwaysOpen) {
    return (
      <section
        className={`dash-mobile-module-card md:!border-none md:!bg-transparent md:!shadow-none ${mobileCardClassName}`}
      >
        <header className="dash-mobile-module-card-title md:hidden">{title}</header>
        <div className="dash-mobile-module-card-body md:contents">{children}</div>
      </section>
    );
  }

  return (
    <section className="dash-mobile-collapse md:!border-none md:!bg-transparent md:!shadow-none">
      <button
        type="button"
        className="dash-mobile-collapse-btn md:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`dash-mobile-collapse-body ${open ? 'block' : 'hidden md:block'}`}>
        {children}
      </div>
    </section>
  );
}
