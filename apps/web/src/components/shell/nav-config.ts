export type NavIconName =
  | 'layoutDashboard'
  | 'truck'
  | 'package'
  | 'users'
  | 'wallet'
  | 'clipboardList'
  | 'messageSquare'
  | 'settings'
  | 'shield';

export type MainNavItem = {
  href: string;
  label: string;
  iconName: NavIconName;
};

export const MAIN_NAV_ITEMS: MainNavItem[] = [
  { href: '/app', label: 'Dashboard', iconName: 'layoutDashboard' },
  { href: '/app/expedicao', label: 'Expedição', iconName: 'truck' },
  { href: '/app/estoque', label: 'Estoque', iconName: 'package' },
  { href: '/app/crm', label: 'CRM', iconName: 'users' },
  { href: '/app/financeiro', label: 'Financeiro', iconName: 'wallet' },
  { href: '/app/chat', label: 'Chat', iconName: 'messageSquare' },
  { href: '/app/configuracoes', label: 'Configurações', iconName: 'settings' },
  { href: '/app/cadastros', label: 'Cadastros', iconName: 'clipboardList' },
  { href: '/app/auditoria', label: 'Auditoria', iconName: 'shield' },
];
