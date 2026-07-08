'use client';

import type { ReactNode } from 'react';
import { ExpeditionSubNav } from '@/src/components/expedicao/layout/expedition-sub-nav';
import {
  ExpedicaoHeaderActionsProvider,
  useExpedicaoHeaderActions,
} from '@/src/components/expedicao/layout/expedicao-header-actions-context';

function FrameInner({ children }: { children: ReactNode }) {
  const { topActions, belowSubnavActions } = useExpedicaoHeaderActions();

  return (
    <div className="erp-expedition-dark">
      <div className="erp-expedition-module">
        {topActions ? (
          <div className="flex w-full items-center justify-between gap-2 px-2 pt-0">
            {topActions}
          </div>
        ) : null}

        <ExpeditionSubNav />

        {belowSubnavActions ? (
          <div className="flex w-full items-center gap-2 px-2 pb-1">
            {belowSubnavActions}
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}

export function ExpedicaoHeaderFrame({ children }: { children: ReactNode }) {
  return (
    <ExpedicaoHeaderActionsProvider>
      <FrameInner>{children}</FrameInner>
    </ExpedicaoHeaderActionsProvider>
  );
}

