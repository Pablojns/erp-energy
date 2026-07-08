/** Shared class names for module pages (Compras, Chat, Cadastros, Configurações). */

export const MODULE_INPUT_CLASS = 'erp-module-input';

export const MODULE_TEXTAREA_CLASS = 'erp-module-textarea';

export const MODULE_CARD_CLASS = 'erp-module-card';

export const MODULE_PANEL_CLASS = 'erp-module-panel';

export function moduleTabClass(active: boolean) {
  return `erp-tab ${active ? 'erp-tab--active' : ''}`;
}

export function modulePrimaryBtnClass(extra = '') {
  return `erp-focus-ring erp-btn erp-btn-primary erp-btn--md ${extra}`.trim();
}

export function moduleSecondaryBtnClass(extra = '') {
  return `erp-focus-ring erp-btn erp-btn-secondary erp-btn--md ${extra}`.trim();
}

export function moduleDangerBtnClass(extra = '') {
  return `erp-focus-ring erp-btn erp-btn-danger erp-btn--md ${extra}`.trim();
}

export function moduleDangerGhostBtnClass(extra = '') {
  return `erp-focus-ring erp-btn erp-btn-danger--ghost erp-btn--sm ${extra}`.trim();
}
