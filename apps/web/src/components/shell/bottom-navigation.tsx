'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, MessageSquare, Menu, Package, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MAIN_NAV_ITEMS } from '@/src/components/shell/nav-config';

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname.startsWith(href);
}

const PRIMARY_ITEMS = [
  { href: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/expedicao', label: 'Expedição', icon: Truck },
  { href: '/app/estoque', label: 'Estoque', icon: Package },
  { href: '/app/chat', label: 'Chat', icon: MessageSquare },
] as const;

export function BottomNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const overflowItems = useMemo(
    () => MAIN_NAV_ITEMS.filter((item) => !PRIMARY_ITEMS.some((p) => p.href === item.href)),
    [],
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
          {PRIMARY_ITEMS.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`inline-flex h-full min-h-[44px] w-full min-w-[44px] flex-col items-center justify-center gap-0.5 text-[11px] ${
                    active ? 'text-[#5b5ef4]' : 'text-white'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex h-full min-h-[44px] w-full min-w-[44px] flex-col items-center justify-center gap-0.5 text-[11px] ${
                open ? 'text-[#5b5ef4]' : 'text-white'
              }`}
            >
              <Menu className="h-[18px] w-[18px]" />
              <span>Menu</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
