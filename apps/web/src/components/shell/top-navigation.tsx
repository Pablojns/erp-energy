'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  Shield,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { LogoutButton } from '@/src/components/auth/logout-button';
import { NotificationsBell } from '@/src/components/layout/notifications-bell';
import { MobileNavDrawer } from '@/src/components/shell/mobile-nav-drawer';
import { ThemeToggle } from '@/src/components/theme/theme-toggle';
import type { AuthUser } from '@/src/services/api/auth';
import { MAIN_NAV_ITEMS, type NavIconName } from './nav-config';

const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  layoutDashboard: LayoutDashboard,
  truck: Truck,
  package: Package,
  users: Users,
  wallet: Wallet,
  clipboardList: ClipboardList,
  messageSquare: MessageSquare,
  settings: Settings,
  shield: Shield,
};

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/app') {
    return pathname === '/app';
  }
  return pathname.startsWith(href);
}

type TopNavigationProps = {
  user: AuthUser;
};

export function TopNavigation({ user }: TopNavigationProps) {
  const pathname = usePathname();

  return (
    <header className="erp-header fixed left-0 right-0 top-0 z-50 backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 lg:gap-5 lg:px-6">
        <Link
          href="/app"
          className="erp-focus-ring group relative flex shrink-0 items-center gap-3 rounded-2xl px-1 py-0.5 outline-none transition duration-300"
        >
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-600 to-cyan-500 shadow-[0_0_0_1px_rgba(255,255,255,0.14)_inset,0_8px_32px_-10px_var(--erp-glow-blue),0_0_48px_-12px_var(--erp-glow-violet)] transition duration-300 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22)_inset,0_12px_40px_-8px_var(--erp-glow-blue)]">
            <span
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-60"
              aria-hidden
            />
            <Activity
              className="relative h-[22px] w-[22px] text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]"
              strokeWidth={2.25}
            />
          </span>
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block text-[15px] font-semibold tracking-tight text-erp-fg">
              ERP Energy
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.22em] text-erp-fg-muted">
              OPS SUITE
            </span>
          </span>
        </Link>

        <MobileNavDrawer />

        <nav
          className="scrollbar-hide erp-scrollbar hidden flex-1 items-stretch justify-start gap-2 overflow-x-auto py-0.5 sm:justify-center sm:gap-2.5 sm:px-1 lg:flex"
          aria-label="Módulos"
        >
          {MAIN_NAV_ITEMS.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = NAV_ICONS[item.iconName];
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active ? 'true' : 'false'}
                className="erp-nav-link erp-focus-ring relative flex min-w-[4rem] shrink-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center outline-none sm:min-w-[4.5rem] sm:px-2"
              >
                <Icon
                  className="erp-nav-icon relative z-10 h-4 w-4 sm:h-[18px] sm:w-[18px]"
                  strokeWidth={active ? 2 : 1.75}
                  aria-hidden
                />
                <span className="relative z-10 max-w-[4.25rem] truncate text-[10px] font-medium leading-tight sm:max-w-[5rem] sm:text-xs">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <ThemeToggle />
          <NotificationsBell />
          <div className="erp-divider hidden h-9 w-px sm:block" />
          <div className="hidden max-w-[148px] text-right md:block lg:max-w-[180px]">
            <p className="truncate text-sm font-medium text-erp-fg">{user.name}</p>
            <p className="truncate text-xs text-erp-fg-muted">{user.email}</p>
          </div>
          <LogoutButton variant="icon" />
        </div>
      </div>
    </header>
  );
}
