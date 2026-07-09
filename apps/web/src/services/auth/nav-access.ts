import type { AuthUser } from '@/src/services/api/auth';
import { MAIN_NAV_ITEMS, type MainNavItem } from '@/src/components/shell/nav-config';

export type UserPermissionGrant = {
  module: string;
  action: string;
  granted: boolean;
};

export const MODULE_VIEW_ACTION = 'ver_modulo';

export type NavModuleId =
  | 'dashboard'
  | 'expedicao'
  | 'estoque'
  | 'compras'
  | 'financeiro'
  | 'cadastros'
  | 'crm'
  | 'chat';

export type ExpeditionSubNavPermission = {
  href: string;
  label: string;
  module: 'expedicao';
  action: string;
  exact?: boolean;
};

export const EXPEDITION_SUB_NAV_ITEMS: ExpeditionSubNavPermission[] = [
  {
    href: '/app/expedicao',
    label: 'Dashboard',
    module: 'expedicao',
    action: MODULE_VIEW_ACTION,
    exact: true,
  },
  {
    href: '/app/expedicao/pedidos',
    label: 'Pedidos',
    module: 'expedicao',
    action: 'ver_pedidos',
    exact: true,
  },
  {
    href: '/app/expedicao/separacao',
    label: 'Separação',
    module: 'expedicao',
    action: 'ver_separacao',
    exact: true,
  },
  {
    href: '/app/expedicao/saidas',
    label: 'Saídas',
    module: 'expedicao',
    action: 'ver_saidas',
    exact: true,
  },
  {
    href: '/app/expedicao/romaneio',
    label: 'Romaneio',
    module: 'expedicao',
    action: 'ver_romaneio',
    exact: true,
  },
];

export function isAdminUser(user: AuthUser): boolean {
  return user.roles.includes('ADMIN');
}

export function hasGrantedPermission(
  permissions: UserPermissionGrant[],
  module: string,
  action: string,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  return permissions.some(
    (p) => p.module === module && p.action === action && p.granted,
  );
}

export function hasModuleViewPermission(
  permissions: UserPermissionGrant[],
  module: string,
  isAdmin: boolean,
): boolean {
  return hasGrantedPermission(
    permissions,
    module,
    MODULE_VIEW_ACTION,
    isAdmin,
  );
}

export function canAccessNavItem(
  item: MainNavItem,
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
): boolean {
  if (item.adminOnly) return isAdmin;
  if (!item.module) return true;
  return hasModuleViewPermission(permissions, item.module, isAdmin);
}

export function filterMainNavItems(
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
): MainNavItem[] {
  return MAIN_NAV_ITEMS.filter((item) =>
    canAccessNavItem(item, permissions, isAdmin),
  );
}

export function canAccessExpeditionSubNavItem(
  item: ExpeditionSubNavPermission,
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
): boolean {
  return hasGrantedPermission(permissions, item.module, item.action, isAdmin);
}

export function filterExpeditionSubNavItems(
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
) {
  return EXPEDITION_SUB_NAV_ITEMS.filter((item) =>
    canAccessExpeditionSubNavItem(item, permissions, isAdmin),
  );
}

function resolveMainNavModule(pathname: string): MainNavItem | null {
  if (pathname === '/app' || pathname === '/app/') {
    return MAIN_NAV_ITEMS.find((item) => item.href === '/app') ?? null;
  }

  const matches = MAIN_NAV_ITEMS.filter(
    (item) => item.href !== '/app' && pathname.startsWith(item.href),
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}

function resolveExpeditionSubItem(pathname: string): ExpeditionSubNavPermission | null {
  if (!pathname.startsWith('/app/expedicao')) return null;
  const exact = EXPEDITION_SUB_NAV_ITEMS.find(
    (item) => item.exact && pathname === item.href,
  );
  if (exact) return exact;
  return (
    EXPEDITION_SUB_NAV_ITEMS.filter(
      (item) => !item.exact && pathname.startsWith(item.href),
    ).sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

export function canAccessPath(
  pathname: string,
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
): boolean {
  if (!pathname.startsWith('/app')) return true;

  const expeditionItem = resolveExpeditionSubItem(pathname);
  if (expeditionItem) {
    return canAccessExpeditionSubNavItem(expeditionItem, permissions, isAdmin);
  }

  const navItem = resolveMainNavModule(pathname);
  if (!navItem) return true;
  return canAccessNavItem(navItem, permissions, isAdmin);
}

export function getAccessDeniedRedirect(
  pathname: string,
  permissions: UserPermissionGrant[],
  isAdmin: boolean,
): string {
  if (pathname === '/app' || pathname === '/app/') {
    const allowed = filterMainNavItems(permissions, isAdmin);
    return allowed.find((item) => item.href !== '/app')?.href ?? '/app';
  }
  return '/app';
}
