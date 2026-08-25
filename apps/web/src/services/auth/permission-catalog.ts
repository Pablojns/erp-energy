export const ADMIN_PERMISSION_MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'expedicao', label: 'Expedição' },
  { id: 'estoque', label: 'Estoque' },
  { id: 'compras', label: 'Compras' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'cadastros', label: 'Cadastros' },
  { id: 'crm', label: 'CRM' },
  { id: 'chat', label: 'Chat' },
  { id: 'correios', label: 'Correios' },
] as const;

export const CRUD_PERMISSION_COLUMNS = [
  { action: 'ver_modulo', label: 'Ver' },
  { action: 'criar', label: 'Criar' },
  { action: 'editar', label: 'Editar' },
  { action: 'excluir', label: 'Excluir' },
] as const;

export const MODULE_EXTRA_ACTIONS: Record<string, string[]> = {
  crm: ['ver_todos_leads'],
  expedicao: [
    'ver_pedidos',
    'ver_separacao',
    'ver_saidas',
    'ver_romaneio',
    'emitir_nf',
    'confirmar_saida',
    'concluir_separacao',
  ],
};

export const EXTRA_ACTION_LABELS: Record<string, string> = {
  ver_todos_leads: 'Ver todos os leads do CRM',
  ver_pedidos: 'Ver pedidos',
  ver_separacao: 'Ver separação',
  ver_saidas: 'Ver saídas',
  ver_romaneio: 'Ver romaneio',
  emitir_nf: 'Emitir NF',
  confirmar_saida: 'Confirmar saída',
  concluir_separacao: 'Concluir separação',
};

const LEGACY_ACTIONS_HIDDEN = new Set([
  'ver_cadastros',
  'criar_cadastro',
  'editar_cadastro',
  'excluir_cadastro',
  'ver_dashboard',
  'ver_movimentacoes',
  'editar_produto',
  'desativar_produto',
  'deletar_movimentacao',
  'criar_pedido',
  'editar_pedido',
  'deletar_pedido',
]);

const CRUD_ACTION_SET = new Set(CRUD_PERMISSION_COLUMNS.map((c) => c.action));

export function isLegacyHiddenAction(action: string): boolean {
  return LEGACY_ACTIONS_HIDDEN.has(action);
}

export function isCrudAction(action: string): boolean {
  return (CRUD_ACTION_SET as Set<string>).has(action);
}
