'use client';

import {
  AlertTriangle,
  BadgeCheck,
  DollarSign,
  FileText,
  Package,
  Printer,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import type { GlassGlow } from '@/src/components/shell/glass-card';
import { GlassCard } from '@/src/components/shell/glass-card';

export type KpiGlow = Extract<
  GlassGlow,
  'blue' | 'violet' | 'amber' | 'emerald' | 'rose'
>;

export type KpiIconName =
  | 'shoppingCart'
  | 'package'
  | 'truck'
  | 'dollarSign'
  | 'alertTriangle'
  | 'badgeCheck'
  | 'printer'
  | 'fileText';

const KPI_ICONS: Record<KpiIconName, LucideIcon> = {
  shoppingCart: ShoppingCart,
  package: Package,
  truck: Truck,
  dollarSign: DollarSign,
  alertTriangle: AlertTriangle,
  badgeCheck: BadgeCheck,
  printer: Printer,
  fileText: FileText,
};

type KpiWidgetProps = {
  title: string;
  value: string;
  subtitle?: string;
  delta?: string;
  glow: KpiGlow;
  iconName: KpiIconName;
  /** SVG polyline points "x,y x,y ..." in viewBox 0 0 100 40 */
  sparkPoints?: string;
  sparkStroke?: string;
};

const GLOW_MAP: Record<KpiGlow, GlassGlow> = {
  blue: 'blue',
  violet: 'violet',
  amber: 'amber',
  emerald: 'emerald',
  rose: 'rose',
};

const ACCENT_LINE: Record<KpiGlow, string> = {
  blue: 'from-sky-400/0 via-sky-400/90 to-sky-400/0',
  violet: 'from-violet-400/0 via-violet-400/85 to-violet-400/0',
  amber: 'from-amber-400/0 via-amber-400/85 to-amber-400/0',
  emerald: 'from-emerald-400/0 via-emerald-400/85 to-emerald-400/0',
  rose: 'from-rose-400/0 via-rose-400/85 to-rose-400/0',
};

const ICON_SHELL: Record<KpiGlow, string> = {
  blue: 'bg-sky-500/12 text-sky-200 ring-sky-400/30 shadow-[0_0_20px_-6px_rgba(56,189,248,0.45)]',
  violet:
    'bg-violet-500/12 text-violet-200 ring-violet-400/30 shadow-[0_0_20px_-6px_rgba(139,92,246,0.42)]',
  amber:
    'bg-amber-500/11 text-amber-200 ring-amber-400/28 shadow-[0_0_20px_-6px_rgba(245,158,11,0.38)]',
  emerald:
    'bg-emerald-500/11 text-emerald-200 ring-emerald-400/28 shadow-[0_0_20px_-6px_rgba(52,211,153,0.35)]',
  rose: 'bg-rose-500/11 text-rose-200 ring-rose-400/28 shadow-[0_0_20px_-6px_rgba(251,113,133,0.38)]',
};

export function KpiWidget({
  title,
  value,
  subtitle,
  delta,
  glow,
  iconName,
  sparkPoints = '0,28 14,26 28,22 42,24 56,14 70,18 84,12 100,8',
  sparkStroke,
}: KpiWidgetProps) {
  const Icon = KPI_ICONS[iconName];
  const uid = useId();
  const gradId = `spark-${uid}`;
  const gridId = `grid-${uid}`;
  const stroke =
    sparkStroke ??
    {
      blue: '#38bdf8',
      violet: '#a78bfa',
      amber: '#fbbf24',
      emerald: '#34d399',
      rose: '#fb7185',
    }[glow];

  return (
    <GlassCard
      glow={GLOW_MAP[glow]}
      hover
      className="group relative isolate overflow-hidden p-5 pb-4 transition duration-300 hover:-translate-y-1"
    >
      <div
        className={`pointer-events-none absolute inset-x-5 top-0 z-10 h-px rounded-full bg-gradient-to-r opacity-95 ${ACCENT_LINE[glow]}`}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-[0.12] blur-2xl"
        style={{ background: stroke }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            {title}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)] tabular-nums">
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>
          ) : null}
          {delta ? (
            <p className="mt-2.5 inline-flex rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs font-medium tracking-tight text-emerald-300/95 ring-1 ring-emerald-400/20">
              {delta}
            </p>
          ) : null}
        </div>
        <span
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 transition duration-300 group-hover:scale-[1.03] ${ICON_SHELL[glow]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      </div>

      <svg
        viewBox="0 0 100 42"
        className="relative z-[1] mt-3 h-[3.35rem] w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.42" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          <pattern
            id={gridId}
            width="20"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 10"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100" height="42" fill={`url(#${gridId})`} opacity="0.6" />
        <polygon
          fill={`url(#${gradId})`}
          points={`0,42 ${sparkPoints} 100,42`}
          opacity="0.92"
        />
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={sparkPoints}
          vectorEffect="non-scaling-stroke"
          style={{
            filter: `drop-shadow(0 0 6px ${stroke}99)`,
          }}
        />
      </svg>
    </GlassCard>
  );
}
