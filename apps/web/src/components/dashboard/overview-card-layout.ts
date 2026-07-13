export type OverviewCardId = 'expedicao' | 'estoque' | 'financeiro';

export const DEFAULT_OVERVIEW_CARD_ORDER: OverviewCardId[] = [
  'expedicao',
  'estoque',
  'financeiro',
];

export function overviewLayoutStorageKey(userId: string) {
  return `erp.dashboard.overview-layout.v1.${userId}`;
}

export function loadOverviewCardOrder(userId: string): OverviewCardId[] {
  if (typeof window === 'undefined') return [...DEFAULT_OVERVIEW_CARD_ORDER];
  try {
    const raw = window.localStorage.getItem(overviewLayoutStorageKey(userId));
    if (!raw) return [...DEFAULT_OVERVIEW_CARD_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_OVERVIEW_CARD_ORDER];
    const valid = parsed.filter(
      (id): id is OverviewCardId =>
        id === 'expedicao' || id === 'estoque' || id === 'financeiro',
    );
    if (valid.length !== DEFAULT_OVERVIEW_CARD_ORDER.length) {
      return [...DEFAULT_OVERVIEW_CARD_ORDER];
    }
    const unique = new Set(valid);
    if (unique.size !== DEFAULT_OVERVIEW_CARD_ORDER.length) {
      return [...DEFAULT_OVERVIEW_CARD_ORDER];
    }
    return valid;
  } catch {
    return [...DEFAULT_OVERVIEW_CARD_ORDER];
  }
}

export function saveOverviewCardOrder(userId: string, order: OverviewCardId[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(overviewLayoutStorageKey(userId), JSON.stringify(order));
}

export function resetOverviewCardOrder(userId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(overviewLayoutStorageKey(userId));
}

export function isDefaultOverviewOrder(order: OverviewCardId[]) {
  return DEFAULT_OVERVIEW_CARD_ORDER.every((id, i) => order[i] === id);
}
