export const NOTIFICATION_PRIORITY = {
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;

export type NotificationPriority =
  (typeof NOTIFICATION_PRIORITY)[keyof typeof NOTIFICATION_PRIORITY];

export const NOTIFICATION_TYPES = {
  ORDER_DELAYED: 'ORDER_DELAYED',
  NF_PENDING: 'NF_PENDING',
  ORDER_URGENT: 'ORDER_URGENT',
  STOCK_LOW: 'STOCK_LOW',
  STOCK_OUT: 'STOCK_OUT',
  PURCHASE_RECEIVED: 'PURCHASE_RECEIVED',
  PURCHASE_OVERDUE: 'PURCHASE_OVERDUE',
  CRM_FOLLOWUP: 'CRM_FOLLOWUP',
  CRM_PROPOSAL_EXPIRING: 'CRM_PROPOSAL_EXPIRING',
  CRM_LEAD_ASSIGNED: 'CRM_LEAD_ASSIGNED',
  MENTION: 'MENTION',
  SYSTEM: 'SYSTEM',
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

/** Tipos configuráveis nas preferências do usuário. */
export const CONFIGURABLE_NOTIFICATION_TYPES: {
  type: string;
  label: string;
  description: string;
  defaultPriority: NotificationPriority;
}[] = [
  {
    type: NOTIFICATION_TYPES.ORDER_DELAYED,
    label: 'Pedido atrasado',
    description: 'Pedido com data de entrega vencida',
    defaultPriority: NOTIFICATION_PRIORITY.HIGH,
  },
  {
    type: NOTIFICATION_TYPES.NF_PENDING,
    label: 'NF pendente',
    description: 'Pedido separado há mais de 1 dia sem NF',
    defaultPriority: NOTIFICATION_PRIORITY.HIGH,
  },
  {
    type: NOTIFICATION_TYPES.ORDER_URGENT,
    label: 'Pedido urgente',
    description: 'Pedido urgente sem separação iniciada',
    defaultPriority: NOTIFICATION_PRIORITY.URGENT,
  },
  {
    type: NOTIFICATION_TYPES.STOCK_LOW,
    label: 'Estoque baixo',
    description: 'Produto abaixo do estoque mínimo',
    defaultPriority: NOTIFICATION_PRIORITY.NORMAL,
  },
  {
    type: NOTIFICATION_TYPES.STOCK_OUT,
    label: 'Estoque zerado',
    description: 'Produto zerado com pedido pendente',
    defaultPriority: NOTIFICATION_PRIORITY.HIGH,
  },
  {
    type: NOTIFICATION_TYPES.PURCHASE_RECEIVED,
    label: 'Compra recebida',
    description: 'Compra marcada como recebida',
    defaultPriority: NOTIFICATION_PRIORITY.NORMAL,
  },
  {
    type: NOTIFICATION_TYPES.PURCHASE_OVERDUE,
    label: 'Compra atrasada',
    description: 'Compra com previsão vencida sem recebimento',
    defaultPriority: NOTIFICATION_PRIORITY.HIGH,
  },
  {
    type: NOTIFICATION_TYPES.CRM_FOLLOWUP,
    label: 'Follow-up CRM',
    description: 'Lead sem touchpoint há mais de 3 dias',
    defaultPriority: NOTIFICATION_PRIORITY.NORMAL,
  },
  {
    type: NOTIFICATION_TYPES.CRM_PROPOSAL_EXPIRING,
    label: 'Proposta vencendo',
    description: 'Proposta comercial vencendo em 2 dias',
    defaultPriority: NOTIFICATION_PRIORITY.HIGH,
  },
  {
    type: NOTIFICATION_TYPES.CRM_LEAD_ASSIGNED,
    label: 'Lead atribuído',
    description: 'Lead atribuído a você',
    defaultPriority: NOTIFICATION_PRIORITY.NORMAL,
  },
  {
    type: NOTIFICATION_TYPES.MENTION,
    label: 'Menções',
    description: 'Você foi mencionado em uma observação',
    defaultPriority: NOTIFICATION_PRIORITY.NORMAL,
  },
  {
    type: NOTIFICATION_TYPES.SYSTEM,
    label: 'Sistema',
    description: 'Avisos gerais do sistema',
    defaultPriority: NOTIFICATION_PRIORITY.LOW,
  },
];

export const DEFAULT_PRIORITY_BY_TYPE: Record<string, NotificationPriority> =
  Object.fromEntries(
    CONFIGURABLE_NOTIFICATION_TYPES.map((row) => [
      row.type,
      row.defaultPriority,
    ]),
  ) as Record<string, NotificationPriority>;
