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
    <div className="erp-expedition-light flex min-h-0 flex-1 flex-col overflow-visible">
      <div className="erp-expedition-module flex min-h-0 flex-1 flex-col overflow-visible">
        {topActions ? (
          <div className="expedition-chrome-row flex w-full shrink-0 items-center justify-between gap-2 px-2 pt-0">
            {topActions}
          </div>
        ) : null}

        <div className="shrink-0 px-2">
          <ExpeditionSubNav />
        </div>

        {belowSubnavActions ? (
          <div className="expedition-chrome-row flex w-full shrink-0 items-center gap-2 px-2">
            {belowSubnavActions}
          </div>
        ) : null}

        <div className="exp-workspace-slot flex min-h-0 flex-1 flex-col overflow-hidden px-2">
          {children}
        </div>
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

