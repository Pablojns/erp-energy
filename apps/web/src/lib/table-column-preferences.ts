export type ColumnPreferenceItem = {
  key: string;
  visible: boolean;
};

export type ColumnDefinition = {
  key: string;
  label: string;
  required?: boolean;
  /** Visível por padrão quando não há preferência salva. @default true */
  defaultVisible?: boolean;
};

function readJson(storageKey: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function writeJson(storageKey: string, value: unknown) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

export function tableColumnPreferencesKey(userId: string, tableId: string) {
  return `erp.table-columns.v1.${userId}.${tableId}`;
}

export function loadColumnPreferences(
  storageKey: string,
  definitions: ColumnDefinition[],
): ColumnPreferenceItem[] {
  const defaultOrder = definitions.map((d) => ({
    key: d.key,
    visible: d.required ? true : (d.defaultVisible ?? true),
  }));

  const parsed = readJson(storageKey);
  if (!parsed || !Array.isArray(parsed)) return defaultOrder;

  const saved = parsed.filter(
    (item): item is ColumnPreferenceItem =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ColumnPreferenceItem).key === 'string' &&
      typeof (item as ColumnPreferenceItem).visible === 'boolean',
  );

  if (saved.length === 0) return defaultOrder;

  const defByKey = new Map(definitions.map((d) => [d.key, d]));
  const merged: ColumnPreferenceItem[] = [];
  const seen = new Set<string>();

  for (const item of saved) {
    const def = defByKey.get(item.key);
    if (!def) continue;
    merged.push({
      key: item.key,
      visible: def.required ? true : item.visible,
    });
    seen.add(item.key);
  }

  for (const def of definitions) {
    if (!seen.has(def.key)) {
      merged.push({ key: def.key, visible: def.required ? true : (def.defaultVisible ?? true) });
    }
  }

  return merged;
}

export function saveColumnPreferences(
  storageKey: string,
  preferences: ColumnPreferenceItem[],
) {
  writeJson(storageKey, preferences);
}

export function resetColumnPreferences(storageKey: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKey);
}

export function applyColumnPreferences<T extends { key: string }>(
  allColumns: T[],
  preferences: ColumnPreferenceItem[],
): T[] {
  const byKey = new Map(allColumns.map((c) => [c.key, c]));
  return preferences
    .filter((p) => p.visible)
    .map((p) => byKey.get(p.key))
    .filter((c): c is T => Boolean(c));
}
