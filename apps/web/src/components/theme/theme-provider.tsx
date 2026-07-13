'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_ERP_THEME, type ErpTheme } from '@/src/lib/theme/theme';

type ThemeContextValue = {
  theme: ErpTheme;
  setTheme: (theme: ErpTheme) => void;
  toggleTheme: () => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo(
    () => ({
      theme: DEFAULT_ERP_THEME,
      setTheme: (_theme: ErpTheme) => undefined,
      toggleTheme: () => undefined,
      isDark: false,
    }),
    [],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div className="min-h-full">{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider.');
  }
  return ctx;
}
