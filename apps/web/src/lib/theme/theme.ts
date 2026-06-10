export type ErpTheme = 'dark' | 'light';

export const ERP_THEME_STORAGE_KEY = 'theme';
export const ERP_THEME_STORAGE_LEGACY_KEY = 'erp-theme';

export const DEFAULT_ERP_THEME: ErpTheme = 'light';

export function isErpTheme(value: string | null | undefined): value is ErpTheme {
  return value === 'dark' || value === 'light';
}

export function getStoredErpTheme(): ErpTheme {
  if (typeof window === 'undefined') {
    return DEFAULT_ERP_THEME;
  }
  try {
    const stored =
      localStorage.getItem(ERP_THEME_STORAGE_KEY) ??
      localStorage.getItem(ERP_THEME_STORAGE_LEGACY_KEY);
    return isErpTheme(stored) ? stored : DEFAULT_ERP_THEME;
  } catch {
    return DEFAULT_ERP_THEME;
  }
}

export function applyErpTheme(theme: ErpTheme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export function persistErpTheme(theme: ErpTheme): void {
  try {
    localStorage.setItem(ERP_THEME_STORAGE_KEY, theme);
    localStorage.setItem(ERP_THEME_STORAGE_LEGACY_KEY, theme);
  } catch {
    /* storage indisponível */
  }
  applyErpTheme(theme);
}
