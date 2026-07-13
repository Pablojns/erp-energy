'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyColumnPreferences,
  loadColumnPreferences,
  resetColumnPreferences,
  saveColumnPreferences,
  tableColumnPreferencesKey,
  type ColumnDefinition,
  type ColumnPreferenceItem,
} from '@/src/lib/table-column-preferences';

export function useTableColumnPreferences(
  userId: string,
  tableId: string,
  definitions: ColumnDefinition[],
) {
  const storageKey = tableColumnPreferencesKey(userId, tableId);

  const defaultPreferences = useMemo(
    () =>
      definitions.map((d) => ({
        key: d.key,
        visible: d.required ? true : (d.defaultVisible ?? true),
      })),
    [definitions],
  );

  const [preferences, setPreferences] = useState<ColumnPreferenceItem[]>(
    defaultPreferences,
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPreferences(loadColumnPreferences(storageKey, definitions));
    setHydrated(true);
  }, [storageKey, definitions]);

  useEffect(() => {
    if (!hydrated) return;
    saveColumnPreferences(storageKey, preferences);
  }, [hydrated, preferences, storageKey]);

  const setVisible = useCallback((key: string, visible: boolean) => {
    setPreferences((prev) =>
      prev.map((item) => {
        const def = definitions.find((d) => d.key === key);
        if (def?.required) return { ...item, visible: true };
        return item.key === key ? { ...item, visible } : item;
      }),
    );
  }, [definitions]);

  const reorder = useCallback((fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setPreferences((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((p) => p.key === fromKey);
      const toIndex = next.findIndex((p) => p.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    resetColumnPreferences(storageKey);
    setPreferences(defaultPreferences);
  }, [defaultPreferences, storageKey]);

  const applyToColumns = useCallback(
    <T extends { key: string }>(allColumns: T[]) =>
      applyColumnPreferences(allColumns, preferences),
    [preferences],
  );

  return {
    preferences,
    definitions,
    setVisible,
    reorder,
    reset,
    applyToColumns,
  };
}
