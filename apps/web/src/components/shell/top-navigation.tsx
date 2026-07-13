'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Box,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Package,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { LogoutButton } from '@/src/components/auth/logout-button';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { NotificationsBell } from '@/src/components/layout/notifications-bell';
import { MobileNavDrawer } from '@/src/components/shell/mobile-nav-drawer';
import { useGlobalSearch } from '@/src/components/shell/global-search-provider';
import type { AuthUser } from '@/src/services/api/auth';
import { type NavIconName } from './nav-config';

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
  box: Box,
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
  const { mainNavItems } = useNavPermissions();
  const { openSearch } = useGlobalSearch();

  return (
    <header className="erp-header fixed left-0 right-0 top-0 z-50 backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4 lg:gap-5 lg:px-6">
        <Link
          href="/app"
          className="erp-focus-ring group relative flex shrink-0 items-center rounded-2xl px-1 py-0.5 outline-none transition duration-300"
          aria-label="Energy Brands ERP"
        >
          <Image
            src="/brand/energy-brands-logo.png"
            alt="Energy Brands"
            width={190}
            height={50}
            priority
            className="h-8 w-auto object-contain sm:h-10"
          />
        </Link>

        <MobileNavDrawer />

        <nav
          className="scrollbar-hide erp-scrollbar hidden flex-1 items-stretch justify-start gap-2 overflow-x-auto py-0.5 sm:justify-center sm:gap-2.5 sm:px-1 lg:flex"
          aria-label="Módulos"
        >
          {mainNavItems.map((item) => {
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
          <button
            type="button"
            onClick={openSearch}
            className="erp-focus-ring flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-2 text-xs text-white/75 transition hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:text-[#2AACE2] sm:px-3"
            aria-label="Busca global (Ctrl+K)"
          >
            <Search className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden rounded border border-white/15 px-1 py-0.5 text-[10px] text-white/70 md:inline">
              Ctrl+K
            </kbd>
          </button>
          <NotificationsBell />
          <div className="erp-divider hidden h-9 w-px sm:block" />
          <div className="hidden max-w-[148px] text-right md:block lg:max-w-[180px]">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-white/60">{user.email}</p>
          </div>
          <LogoutButton variant="icon" />
        </div>
      </div>
    </header>
  );
}
