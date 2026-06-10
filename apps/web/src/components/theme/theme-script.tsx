import {
  DEFAULT_ERP_THEME,
  ERP_THEME_STORAGE_KEY,
  ERP_THEME_STORAGE_LEGACY_KEY,
} from '@/src/lib/theme/theme';

/** Evita flash de tema errado antes do React hidratar. */
export function ThemeScript() {
  const script = `(function(){try{var k=${JSON.stringify(ERP_THEME_STORAGE_KEY)};var lk=${JSON.stringify(ERP_THEME_STORAGE_LEGACY_KEY)};var t=localStorage.getItem(k)||localStorage.getItem(lk);if(t!=='light'&&t!=='dark')t=${JSON.stringify(DEFAULT_ERP_THEME)};document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.classList.toggle('dark',${JSON.stringify(DEFAULT_ERP_THEME)}==='dark');document.documentElement.setAttribute('data-theme',${JSON.stringify(DEFAULT_ERP_THEME)});document.documentElement.style.colorScheme=${JSON.stringify(DEFAULT_ERP_THEME)};}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
