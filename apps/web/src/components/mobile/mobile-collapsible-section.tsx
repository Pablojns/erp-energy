'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function MobileCollapsibleSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { title, defaultOpen = true, children } = props;
  const [open, setOpen] = useState(defaultOpen);

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
