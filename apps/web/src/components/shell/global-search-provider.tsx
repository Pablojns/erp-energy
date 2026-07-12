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
import { GlobalSearchModal } from '@/src/components/shell/global-search-modal';

type GlobalSearchContextValue = {
  open: boolean;
  openSearch: () => void;
  closeSearch: () => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modKey = isMac ? event.metaKey : event.ctrlKey;
      if (modKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ open, openSearch, closeSearch }),
    [open, openSearch, closeSearch],
  );

  return (
    <GlobalSearchContext.Provider value={value}>
      {children}
      <GlobalSearchModal open={open} onClose={closeSearch} />
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error('useGlobalSearch must be used within GlobalSearchProvider');
  }
  return ctx;
}
