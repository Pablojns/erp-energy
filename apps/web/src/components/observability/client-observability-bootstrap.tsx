'use client';

import { useEffect } from 'react';
import { clientLogger } from '@/src/services/observability/client-logger';

export function ClientObservabilityBootstrap() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      clientLogger.fatal('Unhandled window error', {
        action: 'window.onerror',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        error: event.error,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      clientLogger.fatal('Unhandled promise rejection', {
        action: 'window.unhandledrejection',
        reason: event.reason,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    clientLogger.info('Client observability bootstrap initialized', {
      action: 'observability.bootstrap',
    });

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
