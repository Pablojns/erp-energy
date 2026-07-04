'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { MAIN_NAV_ITEMS, type NavIconName } from '@/src/components/shell/nav-config';

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  layoutDashboard: LayoutDashboard,
  truck: Truck,
  shoppingCart: ShoppingCart,
  package: Package,
  users: Users,
  wallet: Wallet,
  clipboardList: ClipboardList,
  messageSquare: MessageSquare,
  settings: Settings,
  shield: Shield,
};

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') return pathname === '/app';
  return pathname.startsWith(href);
}

export function MobileNavDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="erp-focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-erp-fg lg:hidden"
        aria-label="Abrir menu de módulos"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-[58] bg-black/55 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            className="fixed bottom-0 left-0 top-0 z-[59] flex w-[min(88vw,18rem)] flex-col border-r border-white/10 bg-[#0d0f14] shadow-2xl lg:hidden"
            aria-label="Menu lateral"
          >
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500">
                  <Activity className="h-4 w-4 text-white" strokeWidth={2.25} aria-hidden />
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold text-white">ERP Energy</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50">
                    Módulos
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Fechar menu"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <nav className="erp-scrollbar flex-1 overflow-y-auto p-3" aria-label="Módulos">
              <ul className="space-y-1">
                {MAIN_NAV_ITEMS.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  const Icon = NAV_ICONS[item.iconName];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`flex min-h-[40px] items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition ${
                          active
                            ? 'bg-[#5b5ef4]/20 text-[#a5b4fc]'
                            : 'text-white/80 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={active ? 2 : 1.75} aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </aside>
        </>
      ) : null}
    </>
  );
}
