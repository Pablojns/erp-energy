import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AuthUser } from '@/src/services/api/auth';
import { requestMe } from '@/src/services/api/auth';
import { DEV_MOCK_USER, isAuthDisabled } from '@/src/services/auth/bypass';
import {
  AUTH_COOKIE_NAME,
  AUTH_LOGOUT_ROUTE,
} from '@/src/services/api/config';

export async function getAuthenticatedUserOrRedirect(): Promise<AuthUser> {
  if (isAuthDisabled()) {
    return DEV_MOCK_USER;
  }

  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    redirect('/login');
  }

  const me = await requestMe(token);
  if (!me) {
    /** Limpa cookie via Route Handler e envia ao login — evita layout quebrado com token stale ou API offline. */
    redirect(AUTH_LOGOUT_ROUTE);
  }

  return me.user;
}
