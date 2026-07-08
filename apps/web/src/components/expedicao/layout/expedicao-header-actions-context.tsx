'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

type ExpedicaoHeaderActionsContextValue = {
  topActions: ReactNode | null;
  belowSubnavActions: ReactNode | null;
  setTopActions: (node: ReactNode | null) => void;
  setBelowSubnavActions: (node: ReactNode | null) => void;
};

const ExpedicaoHeaderActionsContext = createContext<
  ExpedicaoHeaderActionsContextValue | null
>(null);

export function ExpedicaoHeaderActionsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [topActions, setTopActions] = useState<ReactNode | null>(null);
  const [belowSubnavActions, setBelowSubnavActions] =
    useState<ReactNode | null>(null);

  const handleSetTopActions = useCallback((node: ReactNode | null) => {
    setTopActions(node);
  }, []);

  const handleSetBelowSubnavActions = useCallback(
    (node: ReactNode | null) => {
      setBelowSubnavActions(node);
    },
    [],
  );

  const value = useMemo(
    () => ({
      topActions,
      belowSubnavActions,
      setTopActions: handleSetTopActions,
      setBelowSubnavActions: handleSetBelowSubnavActions,
    }),
    [belowSubnavActions, handleSetBelowSubnavActions, handleSetTopActions, topActions],
  );

  return (
    <ExpedicaoHeaderActionsContext.Provider value={value}>
      {children}
    </ExpedicaoHeaderActionsContext.Provider>
  );
}

export function useExpedicaoHeaderActions() {
  const ctx = useContext(ExpedicaoHeaderActionsContext);
  if (!ctx) {
    throw new Error(
      'useExpedicaoHeaderActions deve ser usado dentro de ExpedicaoHeaderActionsProvider',
    );
  }
  return ctx;
}

