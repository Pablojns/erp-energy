import { AuthenticatedShell } from '@/src/components/layout/authenticated-shell';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';
import { isAuthDisabled } from '@/src/services/auth/bypass';
import { fetchUserPermissions } from '@/src/services/auth/user-permissions';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/src/services/api/config';

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUserOrRedirect();
  const permissions =
    isAuthDisabled() || !user.id
      ? []
      : await fetchUserPermissions(
          user.id,
          (await cookies()).get(AUTH_COOKIE_NAME)?.value ?? '',
        );
  return (
    <AuthenticatedShell user={user} permissions={permissions}>
      {children}
    </AuthenticatedShell>
  );
}
