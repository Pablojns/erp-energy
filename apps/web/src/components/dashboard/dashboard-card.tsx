'use client';

import type { ReactNode } from 'react';
import type { GlassGlow } from '@/src/components/shell/glass-card';
import { GlassCard } from '@/src/components/shell/glass-card';

type DashboardCardProps = {
  title: string;
  subtitle?: string;
  glow?: GlassGlow;
  children: ReactNode;
  className?: string;
};

export function DashboardCard({
  title,
  subtitle,
  glow = 'none',
  children,
  className = '',
}: DashboardCardProps) {
  return (
    <GlassCard glow={glow} className={`p-5 lg:p-6 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-title)]">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-[var(--text-secondary)]">{subtitle}</p> : null}
      </div>
      {children}
    </GlassCard>
  );
}
