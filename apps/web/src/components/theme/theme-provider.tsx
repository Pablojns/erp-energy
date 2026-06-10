'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyErpTheme,
  DEFAULT_ERP_THEME,
  getStoredErpTheme,
  persistErpTheme,
  type ErpTheme,
} from '@/src/lib/theme/theme';

type ThemeContextValue = {
  theme: ErpTheme;
  setTheme: (theme: ErpTheme) => void;
  toggleTheme: () => void;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ErpTheme>(DEFAULT_ERP_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredErpTheme();
    setThemeState(stored);
    applyErpTheme(stored);
    setReady(true);
  }, []);

  const setTheme = useCallback((next: ErpTheme) => {
    setThemeState(next);
    persistErpTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      persistErpTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
    }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <div
        className={`min-h-full transition-colors duration-300 ${ready ? 'opacity-100' : 'opacity-100'}`}
      >
        {children}
      </div>
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
