export type ErpTheme = 'light';

export const ERP_THEME_STORAGE_KEY = 'theme';
export const ERP_THEME_STORAGE_LEGACY_KEY = 'erp-theme';

export const DEFAULT_ERP_THEME: ErpTheme = 'light';

export function isErpTheme(value: string | null | undefined): value is ErpTheme {
  return value === 'light';
}

export function getStoredErpTheme(): ErpTheme {
  return DEFAULT_ERP_THEME;
}

export function applyErpTheme(_theme: ErpTheme): void {
  document.documentElement.classList.remove('dark');
  document.documentElement.setAttribute('data-theme', DEFAULT_ERP_THEME);
  document.documentElement.style.colorScheme = DEFAULT_ERP_THEME;
}

export function persistErpTheme(_theme: ErpTheme): void {
  try {
    localStorage.setItem(ERP_THEME_STORAGE_KEY, DEFAULT_ERP_THEME);
    localStorage.setItem(ERP_THEME_STORAGE_LEGACY_KEY, DEFAULT_ERP_THEME);
  } catch {
    /* storage indisponível */
  }
  applyErpTheme(DEFAULT_ERP_THEME);
}
