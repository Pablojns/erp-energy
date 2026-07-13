import type { NavModuleId } from '@/src/services/auth/nav-access';

export type NavIconName =
  | 'layoutDashboard'
  | 'truck'
  | 'shoppingCart'
  | 'package'
  | 'users'
  | 'wallet'
  | 'clipboardList'
  | 'messageSquare'
  | 'settings'
  | 'shield'
  | 'box';

export type MainNavItem = {
  href: string;
  label: string;
  iconName: NavIconName;
  module?: NavModuleId;
  adminOnly?: boolean;
};

export const MAIN_NAV_ITEMS: MainNavItem[] = [
  { href: '/app', label: 'Dashboard', iconName: 'layoutDashboard', module: 'dashboard' },
  { href: '/app/expedicao', label: 'Expedição', iconName: 'truck', module: 'expedicao' },
  { href: '/app/estoque', label: 'Estoque', iconName: 'package', module: 'estoque' },
  { href: '/app/correios', label: 'Correios', iconName: 'box', module: 'correios' },
  { href: '/app/crm', label: 'CRM', iconName: 'users', module: 'crm' },
  { href: '/app/compras', label: 'Compras', iconName: 'shoppingCart', module: 'compras' },
  { href: '/app/financeiro', label: 'Financeiro', iconName: 'wallet', module: 'financeiro' },
  { href: '/app/chat', label: 'Chat', iconName: 'messageSquare', module: 'chat' },
  { href: '/app/configuracoes', label: 'Configurações', iconName: 'settings' },
  { href: '/app/cadastros', label: 'Cadastros', iconName: 'clipboardList', module: 'cadastros' },
  { href: '/app/auditoria', label: 'Auditoria', iconName: 'shield', adminOnly: true },
];
