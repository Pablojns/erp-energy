import type { ButtonHTMLAttributes, ReactNode } from 'react';

type GlowButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type GlowButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<GlowButtonVariant, string> = {
  primary:
    'erp-btn-primary hover:brightness-110 active:brightness-95',
  secondary: 'erp-btn-secondary active:scale-[0.99]',
  ghost: 'erp-btn-ghost border border-transparent active:bg-[var(--erp-bg-hover)]',
  danger: 'erp-btn-danger',
};

const SIZE: Record<GlowButtonSize, string> = {
  sm: 'erp-btn--sm min-h-8 px-3 text-xs',
  md: 'erp-btn--md min-h-10 px-4 text-sm',
  lg: 'erp-btn--lg min-h-11 px-5 text-sm',
};

type GlowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: GlowButtonVariant;
  size?: GlowButtonSize;
};

export function GlowButton({
  children,
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: GlowButtonProps) {
  return (
    <button
      type="button"
      className={`erp-focus-ring erp-btn inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
