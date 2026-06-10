'use client';

import type { ReactNode } from 'react';
import { ExpeditionSubNav } from '@/src/components/expedicao/layout/expedition-sub-nav';

export default function ExpedicaoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="erp-expedition-dark">
      <div className="erp-expedition-module">
        <ExpeditionSubNav />
        {children}
      </div>
    </div>
  );
}
