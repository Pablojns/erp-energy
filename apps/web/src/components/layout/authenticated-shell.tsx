import type { ReactNode } from 'react';
import { ModuleRouteGuard } from '@/src/components/layout/module-route-guard';
import { NavPermissionsProvider } from '@/src/components/layout/nav-permissions-context';
import { AppShell } from '@/src/components/shell/app-shell';
import type { AuthUser } from '@/src/services/api/auth';
import type { UserPermissionGrant } from '@/src/services/auth/nav-access';

type AuthenticatedShellProps = {
  user: AuthUser;
  permissions: UserPermissionGrant[];
  children: ReactNode;
};

export function AuthenticatedShell({
  user,
  permissions,
  children,
}: AuthenticatedShellProps) {
  return (
    <NavPermissionsProvider user={user} permissions={permissions}>
      <AppShell user={user}>
        <ModuleRouteGuard>{children}</ModuleRouteGuard>
      </AppShell>
    </NavPermissionsProvider>
  );
}
