export const USER_DEPARTMENTS = [
  'GESTAO',
  'COMERCIAL',
  'LOGISTICA',
  'FINANCEIRO',
  'ADMIN',
  'MARKETING',
  'OPERACIONAL',
] as const;

export type UserDepartment = (typeof USER_DEPARTMENTS)[number];

/** Departamentos que recebem cada tipo imediatamente (ADMIN é escalado após 4h). */
export const NOTIFICATION_ROUTING: Record<string, UserDepartment[]> = {
  ORDER_DELAYED: ['LOGISTICA', 'GESTAO', 'ADMIN'],
  ORDER_URGENT: ['LOGISTICA', 'GESTAO', 'ADMIN'],
  NF_PENDING: ['LOGISTICA', 'FINANCEIRO', 'ADMIN'],
  STOCK_LOW: ['LOGISTICA', 'GESTAO', 'ADMIN'],
  STOCK_OUT: ['LOGISTICA', 'GESTAO', 'ADMIN'],
  PURCHASE_RECEIVED: ['LOGISTICA', 'GESTAO'],
  PURCHASE_OVERDUE: ['GESTAO', 'FINANCEIRO', 'ADMIN'],
  CRM_FOLLOWUP: ['COMERCIAL', 'GESTAO'],
  CRM_PROPOSAL_EXPIRING: ['COMERCIAL', 'GESTAO'],
  CRM_LEAD_ASSIGNED: ['COMERCIAL'],
  QUOTE_PENDING_APPROVAL: ['GESTAO', 'ADMIN'],
  MENTION: [],
  SYSTEM: ['ADMIN', 'GESTAO'],
};

/** Tipos que escalam para ADMIN após 4h sem leitura pelos responsáveis primários. */
export const ADMIN_ESCALATION_TYPES = new Set([
  'ORDER_DELAYED',
  'ORDER_URGENT',
  'NF_PENDING',
  'STOCK_LOW',
  'STOCK_OUT',
  'PURCHASE_OVERDUE',
]);

/** Tipos agrupáveis em digest (uma notificação por tipo com contador). */
export const DIGEST_ELIGIBLE_TYPES = new Set([
  'ORDER_DELAYED',
  'ORDER_URGENT',
  'NF_PENDING',
  'STOCK_LOW',
  'STOCK_OUT',
  'PURCHASE_RECEIVED',
  'PURCHASE_OVERDUE',
  'CRM_FOLLOWUP',
  'CRM_PROPOSAL_EXPIRING',
]);

export function primaryDepartmentsForType(type: string): UserDepartment[] {
  const departments = NOTIFICATION_ROUTING[type] ?? [];
  if (type === 'SYSTEM') {
    return departments;
  }
  return departments.filter((dept) => dept !== 'ADMIN');
}

export function immediateAdminDepartmentsForType(type: string): UserDepartment[] {
  if (type === 'SYSTEM' || type === 'QUOTE_PENDING_APPROVAL') {
    return ['ADMIN'];
  }
  return [];
}

export type DigestItem = {
  entityId: string;
  entityType: string;
  label: string;
  link?: string | null;
};

export const DIGEST_TITLES: Record<
  string,
  { singular: string; plural: (count: number) => string }
> = {
  ORDER_DELAYED: {
    singular: '1 pedido atrasado',
    plural: (n) => `${n} pedidos atrasados`,
  },
  ORDER_URGENT: {
    singular: '1 pedido urgente',
    plural: (n) => `${n} pedidos urgentes`,
  },
  NF_PENDING: {
    singular: '1 pedido com NF pendente',
    plural: (n) => `${n} pedidos com NF pendente`,
  },
  STOCK_LOW: {
    singular: '1 produto com estoque baixo',
    plural: (n) => `${n} produtos com estoque baixo`,
  },
  STOCK_OUT: {
    singular: '1 produto zerado',
    plural: (n) => `${n} produtos zerados`,
  },
  PURCHASE_RECEIVED: {
    singular: '1 compra recebida',
    plural: (n) => `${n} compras recebidas`,
  },
  PURCHASE_OVERDUE: {
    singular: '1 compra atrasada',
    plural: (n) => `${n} compras atrasadas`,
  },
  CRM_FOLLOWUP: {
    singular: '1 lead sem follow-up',
    plural: (n) => `${n} leads sem follow-up`,
  },
  CRM_PROPOSAL_EXPIRING: {
    singular: '1 proposta vencendo',
    plural: (n) => `${n} propostas vencendo`,
  },
};

/** Tipos relevantes por departamento para o resumo diário. */
export const DAILY_DIGEST_TYPES_BY_DEPARTMENT: Record<
  UserDepartment,
  string[]
> = {
  GESTAO: [
    'ORDER_DELAYED',
    'ORDER_URGENT',
    'STOCK_LOW',
    'STOCK_OUT',
    'PURCHASE_RECEIVED',
    'PURCHASE_OVERDUE',
    'CRM_FOLLOWUP',
    'CRM_PROPOSAL_EXPIRING',
  ],
  COMERCIAL: ['CRM_FOLLOWUP', 'CRM_PROPOSAL_EXPIRING', 'CRM_LEAD_ASSIGNED'],
  LOGISTICA: [
    'ORDER_DELAYED',
    'ORDER_URGENT',
    'NF_PENDING',
    'STOCK_LOW',
    'STOCK_OUT',
    'PURCHASE_RECEIVED',
  ],
  FINANCEIRO: ['NF_PENDING', 'PURCHASE_OVERDUE'],
  ADMIN: [
    'ORDER_DELAYED',
    'ORDER_URGENT',
    'NF_PENDING',
    'STOCK_LOW',
    'STOCK_OUT',
    'PURCHASE_OVERDUE',
    'SYSTEM',
  ],
  MARKETING: ['CRM_FOLLOWUP', 'CRM_PROPOSAL_EXPIRING'],
  OPERACIONAL: ['ORDER_DELAYED', 'ORDER_URGENT', 'STOCK_LOW', 'STOCK_OUT'],
};
