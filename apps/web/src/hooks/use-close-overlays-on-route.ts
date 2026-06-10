'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Chama `closeAll` quando o pathname muda após a montagem inicial.
 * Evita backdrop de modal/notificação “preso” após navegação client-side
 * (ex.: shell que não desmonta).
 */
export function useCloseOverlaysOnRouteChange(closeAll: () => void) {
  const pathname = usePathname();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    closeAll();
  }, [pathname, closeAll]);
}
