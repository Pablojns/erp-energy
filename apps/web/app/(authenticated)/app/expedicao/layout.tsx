'use client';

import type { ReactNode } from 'react';
import { ExpedicaoHeaderFrame } from '@/src/components/expedicao/layout/expedicao-header-frame';

export default function ExpedicaoLayout({ children }: { children: ReactNode }) {
  return (
    <ExpedicaoHeaderFrame>{children}</ExpedicaoHeaderFrame>
  );
}
