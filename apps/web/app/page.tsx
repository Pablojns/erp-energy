import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/src/services/api/config';
import { isAuthDisabled } from '@/src/services/auth/bypass';

export default async function Home() {
  if (isAuthDisabled()) {
    redirect('/app');
  }

  const hasToken = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  redirect(hasToken ? '/app' : '/login');
}
