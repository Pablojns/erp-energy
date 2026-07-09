'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';

export function ModuleRouteGuard(props: { children: React.ReactNode }) {
  const { children } = props;
  const pathname = usePathname();
  const router = useRouter();
  const { canAccessPath, getAccessDeniedRedirect } = useNavPermissions();

  const allowed = canAccessPath(pathname);

  useEffect(() => {
    if (!allowed) {
      router.replace(getAccessDeniedRedirect(pathname));
    }
  }, [allowed, getAccessDeniedRedirect, pathname, router]);

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
