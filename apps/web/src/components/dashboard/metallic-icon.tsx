import type { LucideIcon } from 'lucide-react';

type MetallicIconProps = {
  icon: LucideIcon;
  className?: string;
  size?: number;
};

export function MetallicIcon({ icon: Icon, className = '', size = 20 }: MetallicIconProps) {
  return (
    <span className={`dash-metallic-icon inline-flex shrink-0 ${className}`} aria-hidden>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="dash-metallic-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#94a3b8" />
            <stop offset="35%" stopColor="#e2e8f0" />
            <stop offset="55%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
      </svg>
      <Icon size={size} strokeWidth={1.75} />
    </span>
  );
}
