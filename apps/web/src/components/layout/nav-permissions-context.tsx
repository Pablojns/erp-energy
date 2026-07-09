'use client';

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@/src/services/api/auth';
import {
  canAccessExpeditionSubNavItem,
  canAccessNavItem,
  canAccessPath,
  filterExpeditionSubNavItems,
  filterMainNavItems,
  getAccessDeniedRedirect,
  hasGrantedPermission,
  hasModuleViewPermission,
  isAdminUser,
  type ExpeditionSubNavPermission,
  type UserPermissionGrant,
} from '@/src/services/auth/nav-access';
import type { MainNavItem } from '@/src/components/shell/nav-config';

type NavPermissionsContextValue = {
  user: AuthUser;
  permissions: UserPermissionGrant[];
  isAdmin: boolean;
  mainNavItems: MainNavItem[];
  expeditionSubNavItems: ExpeditionSubNavPermission[];
  canAccessPath: (pathname: string) => boolean;
  canAccessNavItem: (item: MainNavItem) => boolean;
  canAccessExpeditionSubNavItem: (item: ExpeditionSubNavPermission) => boolean;
  hasModuleAccess: (module: string) => boolean;
  hasPermission: (module: string, action: string) => boolean;
  getAccessDeniedRedirect: (pathname: string) => string;
};

const NavPermissionsContext = createContext<NavPermissionsContextValue | null>(
  null,
);

export function NavPermissionsProvider(props: {
  user: AuthUser;
  permissions: UserPermissionGrant[];
  children: ReactNode;
}) {
  const { user, permissions, children } = props;
  const isAdmin = isAdminUser(user);

  const value = useMemo<NavPermissionsContextValue>(() => {
    const mainNavItems = filterMainNavItems(permissions, isAdmin);
    const expeditionSubNavItems = filterExpeditionSubNavItems(
      permissions,
      isAdmin,
    );

    return {
      user,
      permissions,
      isAdmin,
      mainNavItems,
      expeditionSubNavItems,
      canAccessPath: (pathname: string) =>
        canAccessPath(pathname, permissions, isAdmin),
      canAccessNavItem: (item: MainNavItem) =>
        canAccessNavItem(item, permissions, isAdmin),
      canAccessExpeditionSubNavItem: (item: ExpeditionSubNavPermission) =>
        canAccessExpeditionSubNavItem(item, permissions, isAdmin),
      hasModuleAccess: (module: string) =>
        hasModuleViewPermission(permissions, module, isAdmin),
      hasPermission: (module: string, action: string) =>
        hasGrantedPermission(permissions, module, action, isAdmin),
      getAccessDeniedRedirect: (pathname: string) =>
        getAccessDeniedRedirect(pathname, permissions, isAdmin),
    };
  }, [user, permissions, isAdmin]);

  return (
    <NavPermissionsContext.Provider value={value}>
      {children}
    </NavPermissionsContext.Provider>
  );
}

export function useNavPermissions(): NavPermissionsContextValue {
  const ctx = useContext(NavPermissionsContext);
  if (!ctx) {
    throw new Error('useNavPermissions must be used within NavPermissionsProvider');
  }
  return ctx;
}
