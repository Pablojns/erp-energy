'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Menu,
  Package,
  Truck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { MobileBottomDrawer } from '@/src/components/mobile/mobile-bottom-drawer';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname.startsWith(href);
}

const PRIMARY = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/expedicao', label: 'Expedição', icon: Truck },
  { href: '/app/crm', label: 'CRM', icon: Users },
  { href: '/app/estoque', label: 'Estoque', icon: Package },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mainNavItems } = useNavPermissions();

  const primaryItems = useMemo(
    () => PRIMARY.filter((item) => mainNavItems.some((nav) => nav.href === item.href)),
    [mainNavItems],
  );

  const overflowItems = useMemo(
    () => mainNavItems.filter((item) => !primaryItems.some((p) => p.href === item.href)),
    [mainNavItems, primaryItems],
  );

  return (
    <>
      <MobileBottomDrawer open={open} onClose={() => setOpen(false)} title="Módulos">
        <div className="grid gap-1">
          {overflowItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`erp-mobile-action-item${
                isNavActive(pathname, item.href) ? ' !border-[var(--accent)] !text-[var(--accent)]' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </MobileBottomDrawer>

      <nav className="erp-bottom-nav fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-[#0f172a] md:hidden">
        <ul className="mx-auto grid h-14 max-w-[640px] grid-cols-5">
          {primaryItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-flex h-full w-full min-h-[40px] min-w-[40px] flex-col items-center justify-center gap-0.5 text-[10px] leading-tight transition active:scale-[0.98] ${
                    active ? 'text-[#2AACE2]' : 'text-white'
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center rounded-md p-0.5 ${
                      active ? 'text-white' : ''
                    }`}
                    style={
                      active
                        ? { background: 'linear-gradient(to right, #2AACE2, #5BBFB0)' }
                        : undefined
                    }
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`inline-flex h-full w-full min-h-[40px] min-w-[40px] flex-col items-center justify-center gap-0.5 text-[10px] leading-tight transition active:scale-[0.98] ${
                open ? 'text-[#2AACE2]' : 'text-white'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center rounded-md p-0.5 ${
                  open ? 'text-white' : ''
                }`}
                style={
                  open
                    ? { background: 'linear-gradient(to right, #2AACE2, #5BBFB0)' }
                    : undefined
                }
              >
                <Menu className="h-5 w-5" />
              </span>
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
