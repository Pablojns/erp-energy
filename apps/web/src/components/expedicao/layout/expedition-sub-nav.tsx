'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardList, FileText, Truck, Zap } from 'lucide-react';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';

const SUB_NAV_ICONS = {
  '/app/expedicao': BarChart3,
  '/app/expedicao/pedidos': ClipboardList,
  '/app/expedicao/separacao': Zap,
  '/app/expedicao/saidas': Truck,
  '/app/expedicao/romaneio': FileText,
} as const;

export function ExpeditionSubNav() {
  const pathname = usePathname();
  const { expeditionSubNavItems } = useNavPermissions();

  return (
    <nav className="erp-subnav" aria-label="Módulo Expedição">
      {expeditionSubNavItems.map((t) => {
        const active = t.exact
          ? pathname === t.href
          : pathname.startsWith(t.href);
        const Icon = SUB_NAV_ICONS[t.href as keyof typeof SUB_NAV_ICONS];
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`erp-subnav-link ${active ? 'erp-subnav-link--active' : ''}`}
          >
            <Icon className="erp-icon-sm" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
