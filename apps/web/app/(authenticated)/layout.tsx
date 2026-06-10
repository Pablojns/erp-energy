import { AuthenticatedShell } from '@/src/components/layout/authenticated-shell';
import { getAuthenticatedUserOrRedirect } from '@/src/services/auth/session';

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getAuthenticatedUserOrRedirect();
  return <AuthenticatedShell user={user}>{children}</AuthenticatedShell>;
}
