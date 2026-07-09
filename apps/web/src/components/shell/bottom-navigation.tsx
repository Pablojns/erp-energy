'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Menu, Package, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname.startsWith(href);
}

export function BottomNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { mainNavItems } = useNavPermissions();

  const primaryItems = useMemo(
    () =>
      [
        { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
        { href: '/app/expedicao', label: 'Expedição', icon: Truck },
        { href: '/app/estoque', label: 'Estoque', icon: Package },
        { href: '/app/chat', label: 'Chat', icon: MessageSquare },
      ].filter((item) => mainNavItems.some((nav) => nav.href === item.href)),
    [mainNavItems],
  );

  const overflowItems = useMemo(
    () => mainNavItems.filter((item) => !primaryItems.some((p) => p.href === item.href)),
    [mainNavItems, primaryItems],
  );

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-[59] bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="absolute bottom-[72px] right-3 w-[min(92vw,22rem)] rounded-2xl border border-white/10 bg-[#0d0f14] p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Menu</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-white/70"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-2">
              {overflowItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`min-h-[44px] rounded-xl px-3 py-2 text-sm ${
                    isNavActive(pathname, item.href)
                      ? 'bg-white/15 text-white'
                      : 'bg-white/5 text-white/80'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-[60] h-[60px] border-t border-white/10 bg-[#0d0f14] lg:hidden">
        <ul className="mx-auto grid h-full max-w-[640px] grid-cols-5">
          {primaryItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-flex h-full min-h-[40px] w-full min-w-[40px] flex-col items-center justify-center gap-0.5 text-xs ${
                    active ? 'text-[#5b5ef4]' : 'text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex h-full min-h-[40px] w-full min-w-[40px] flex-col items-center justify-center gap-0.5 text-xs ${
                open ? 'text-[#5b5ef4]' : 'text-white'
              }`}
            >
              <Menu className="h-4 w-4" />
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
