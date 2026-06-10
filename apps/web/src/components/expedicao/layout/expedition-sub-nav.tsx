'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardList, Truck, Zap } from 'lucide-react';

const TABS = [
  { href: '/app/expedicao', label: 'Dashboard', icon: BarChart3, exact: true },
  { href: '/app/expedicao/pedidos', label: 'Pedidos', icon: ClipboardList, exact: true },
  { href: '/app/expedicao/separacao', label: 'Separação', icon: Zap, exact: true },
  { href: '/app/expedicao/saidas', label: 'Saídas', icon: Truck, exact: true },
] as const;

export function ExpeditionSubNav() {
  const pathname = usePathname();

  return (
    <nav className="exp-light-subnav" aria-label="Módulo Expedição">
      {TABS.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`exp-light-subnav-link ${active ? 'exp-light-subnav-link--active' : ''}`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
