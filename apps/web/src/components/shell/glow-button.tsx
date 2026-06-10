import type { ButtonHTMLAttributes, ReactNode } from 'react';

type GlowButtonVariant = 'primary' | 'secondary' | 'ghost';

const VARIANT: Record<GlowButtonVariant, string> = {
  primary:
    'erp-btn-primary hover:brightness-110 active:brightness-95',
  secondary: 'erp-btn-secondary active:scale-[0.99]',
  ghost: 'erp-btn-ghost border border-transparent active:bg-[var(--erp-bg-hover)]',
};

type GlowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: GlowButtonVariant;
};

export function GlowButton({
  children,
  variant = 'secondary',
  className = '',
  ...props
}: GlowButtonProps) {
  return (
    <button
      type="button"
      className={`erp-focus-ring inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${VARIANT[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
