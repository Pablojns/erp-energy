import type { CSSProperties, ReactNode } from 'react';

export type GlassGlow =
  | 'none'
  | 'blue'
  | 'violet'
  | 'amber'
  | 'emerald'
  | 'rose';

const GLOW_CLASS: Record<GlassGlow, string> = {
  none: '',
  blue: 'shadow-[0_0_56px_-10px_var(--erp-glow-blue),inset_0_1px_0_0_color-mix(in_srgb,var(--erp-fg)_6%,transparent)] border-sky-400/30',
  violet:
    'shadow-[0_0_56px_-10px_var(--erp-glow-violet),inset_0_1px_0_0_color-mix(in_srgb,var(--erp-fg)_6%,transparent)] border-violet-400/28',
  amber:
    'shadow-[0_0_56px_-10px_rgba(245,158,11,0.22),inset_0_1px_0_0_color-mix(in_srgb,var(--erp-fg)_6%,transparent)] border-amber-400/28',
  emerald:
    'shadow-[0_0_56px_-10px_rgba(52,211,153,0.2),inset_0_1px_0_0_color-mix(in_srgb,var(--erp-fg)_6%,transparent)] border-emerald-400/28',
  rose:
    'shadow-[0_0_56px_-10px_rgba(251,113,133,0.22),inset_0_1px_0_0_color-mix(in_srgb,var(--erp-fg)_6%,transparent)] border-rose-400/28',
};

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  glow?: GlassGlow;
  hover?: boolean;
  style?: CSSProperties;
};

export function GlassCard({
  children,
  className = '',
  glow = 'none',
  hover = false,
  style,
}: GlassCardProps) {
  return (
    <div
      style={style}
      className={`erp-surface rounded-2xl sm:rounded-[22px] ${GLOW_CLASS[glow]} ${hover ? 'erp-surface-hover hover:shadow-[0_12px_40px_-12px_color-mix(in_srgb,var(--erp-fg)_18%,transparent)]' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
