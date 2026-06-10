import type { ReactNode } from 'react';
import { AppShell } from '@/src/components/shell/app-shell';
import type { AuthUser } from '@/src/services/api/auth';

type AuthenticatedShellProps = {
  user: AuthUser;
  children: ReactNode;
};

export function AuthenticatedShell({ user, children }: AuthenticatedShellProps) {
  return <AppShell user={user}>{children}</AppShell>;
}
