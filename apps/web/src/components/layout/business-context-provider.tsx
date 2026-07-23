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
  BUSINESS_CONTEXT_ORDER_SOURCE,
  businessContextStorageKey,
  isBusinessContext,
  isFilteredBusinessContext,
  type BusinessContext,
} from '@/src/lib/business-context';
import type { AuthUser } from '@/src/services/api/auth';

type BusinessContextValue = {
  context: BusinessContext;
  setContext: (next: BusinessContext) => void;
  orderSource: string;
  companyCnpjHint: 'SAO_PAULO' | 'LONDRINA' | null;
};

const BusinessContextReact = createContext<BusinessContextValue | null>(null);

function readStoredContext(userId: string): BusinessContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(businessContextStorageKey(userId));
    return isBusinessContext(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredContext(userId: string, value: BusinessContext) {
  try {
    window.localStorage.setItem(businessContextStorageKey(userId), value);
  } catch {
    /* ignore quota / private mode */
  }
}

function companyHintFor(
  context: BusinessContext,
): 'SAO_PAULO' | 'LONDRINA' | null {
  if (context === 'WEG') return 'SAO_PAULO';
  if (context === 'SITE') return 'LONDRINA';
  return null;
}

export function BusinessContextProvider(props: {
  user: AuthUser;
  children: ReactNode;
}) {
  const { user, children } = props;
  const defaultFromUser: BusinessContext = isFilteredBusinessContext(
    user.defaultContext,
  )
    ? user.defaultContext
    : 'WEG';

  const [context, setContextState] = useState<BusinessContext>(defaultFromUser);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredContext(user.id);
    setContextState(stored ?? defaultFromUser);
    setHydrated(true);
  }, [user.id, defaultFromUser]);

  const setContext = useCallback(
    (next: BusinessContext) => {
      setContextState(next);
      writeStoredContext(user.id, next);
    },
    [user.id],
  );

  const value = useMemo<BusinessContextValue>(
    () => ({
      context,
      setContext,
      orderSource: BUSINESS_CONTEXT_ORDER_SOURCE[context],
      companyCnpjHint: companyHintFor(context),
    }),
    [context, setContext],
  );

  // Evita flash WEG→SITE na Aline antes do localStorage
  if (!hydrated) {
    return (
      <BusinessContextReact.Provider
        value={{
          context: defaultFromUser,
          setContext,
          orderSource: BUSINESS_CONTEXT_ORDER_SOURCE[defaultFromUser],
          companyCnpjHint: companyHintFor(defaultFromUser),
        }}
      >
        {children}
      </BusinessContextReact.Provider>
    );
  }

  return (
    <BusinessContextReact.Provider value={value}>
      {children}
    </BusinessContextReact.Provider>
  );
}

export function useBusinessContext(): BusinessContextValue {
  const ctx = useContext(BusinessContextReact);
  if (!ctx) {
    throw new Error('useBusinessContext must be used within BusinessContextProvider');
  }
  return ctx;
}
