export const PERMISSION_MODULES = [
  'dashboard',
  'expedicao',
  'estoque',
  'compras',
  'financeiro',
  'cadastros',
  'crm',
  'chat',
  'correios',
] as const;

export type PermissionModuleId = (typeof PERMISSION_MODULES)[number];

export const CRUD_PERMISSION_ACTIONS = ['criar', 'editar', 'excluir'] as const;

/** When the new generic action is required, these legacy actions also count as granted. */
export const PERMISSION_ACTION_ALIASES: Record<string, string[]> = {
  'dashboard:ver_modulo': ['ver_dashboard'],
  'cadastros:ver_modulo': ['ver_cadastros'],
  'cadastros:criar': ['criar_cadastro'],
  'cadastros:editar': ['editar_cadastro'],
  'cadastros:excluir': ['excluir_cadastro'],
  'estoque:ver_modulo': ['ver_movimentacoes'],
  'estoque:editar': ['editar_produto'],
  'estoque:excluir': ['desativar_produto', 'deletar_movimentacao'],
  'expedicao:criar': ['criar_pedido'],
  'expedicao:editar': ['editar_pedido'],
  'expedicao:excluir': ['deletar_pedido'],
};
