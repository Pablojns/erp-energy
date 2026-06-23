import { generateUUID } from '@/src/lib/uuid';

export type SavedFilterPreset<T> = {
  id: string;
  name: string;
  value: T;
  createdAt: string;
};

function readRaw(storageKey: string): SavedFilterPreset<unknown>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedFilterPreset<unknown> =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SavedFilterPreset<unknown>).id === 'string' &&
        typeof (item as SavedFilterPreset<unknown>).name === 'string' &&
        'value' in (item as SavedFilterPreset<unknown>),
    );
  } catch {
    return [];
  }
}

function writeRaw(storageKey: string, presets: SavedFilterPreset<unknown>[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey, JSON.stringify(presets));
}

export function loadSavedFilters<T>(storageKey: string): SavedFilterPreset<T>[] {
  return readRaw(storageKey) as SavedFilterPreset<T>[];
}

export function saveNamedFilter<T>(
  storageKey: string,
  name: string,
  value: T,
): SavedFilterPreset<T> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Informe um nome para o filtro.');
  }
  const preset: SavedFilterPreset<T> = {
    id: generateUUID(),
    name: trimmed,
    value,
    createdAt: new Date().toISOString(),
  };
  const next = [preset, ...loadSavedFilters<T>(storageKey)] as SavedFilterPreset<unknown>[];
  writeRaw(storageKey, next);
  return preset;
}

export function deleteSavedFilter(storageKey: string, id: string) {
  const next = readRaw(storageKey).filter((p) => p.id !== id);
  writeRaw(storageKey, next);
}
