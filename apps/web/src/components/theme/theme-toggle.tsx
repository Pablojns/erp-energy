'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/src/components/theme/theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="erp-icon-btn relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl outline-none transition duration-300 hover:scale-[1.02] active:scale-[0.98]"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      <span
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 hover:opacity-100"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, var(--erp-accent-soft), transparent 70%)',
        }}
        aria-hidden
      />
      <Sun
        className={`relative z-10 h-[18px] w-[18px] text-amber-500 transition-all duration-500 ease-out ${
          isDark
            ? 'rotate-90 scale-0 opacity-0'
            : 'rotate-0 scale-100 opacity-100'
        }`}
        strokeWidth={2}
        aria-hidden
      />
      <Moon
        className={`absolute z-10 h-[18px] w-[18px] text-sky-400 transition-all duration-500 ease-out ${
          isDark
            ? 'rotate-0 scale-100 opacity-100'
            : '-rotate-90 scale-0 opacity-0'
        }`}
        strokeWidth={2}
        aria-hidden
      />
      <span className="sr-only">
        Tema atual: {theme === 'dark' ? 'escuro' : 'claro'}
      </span>
    </button>
  );
}
