import type { AuthUser } from '@/src/services/api/auth';

/** Desliga login/middleware quando `NEXT_PUBLIC_AUTH_DISABLED=true` (somente desenvolvimento). */
export function isAuthDisabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DISABLED === 'true';
}

export const DEV_MOCK_USER: AuthUser = {
  id: 'dev-bypass',
  name: 'Desenvolvimento',
  email: 'dev@local',
  isActive: true,
  roles: ['ADMIN'],
  defaultContext: 'WEG',
};
