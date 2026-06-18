/** Espelho dos enums Prisma `OrderStatus`, `OrderSource`, `InvoiceStatus` para validação/DTOs. */

export const ORDER_SOURCE = {
  WEG_MERCADO_ELETRONICO: 'WEG_MERCADO_ELETRONICO',
  ECOMMERCE: 'ECOMMERCE',
  SITE: 'SITE',
  MANUAL: 'MANUAL',
} as const;

export type OrderSource = (typeof ORDER_SOURCE)[keyof typeof ORDER_SOURCE];

export const ORDER_SOURCE_VALUES = Object.values(ORDER_SOURCE);

export const ORDER_STATUS = {
  NOVO: 'NOVO',
  ANALISADO: 'ANALISADO',
  PARCIAL: 'PARCIAL',
  RESERVADO: 'RESERVADO',
  EM_SEPARACAO: 'EM_SEPARACAO',
  SEPARADO: 'SEPARADO',
  AGUARDANDO_NF: 'AGUARDANDO_NF',
  NF_ATRELADA: 'NF_ATRELADA',
  EXPEDIDO: 'EXPEDIDO',
  FINALIZADO: 'FINALIZADO',
  CANCELADO: 'CANCELADO',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

/** Cadeia de status após início da separação (transições sequenciais). */
export const ORDER_STATUS_EXPEDITION_CHAIN = [
  ORDER_STATUS.EM_SEPARACAO,
  ORDER_STATUS.SEPARADO,
  ORDER_STATUS.AGUARDANDO_NF,
  ORDER_STATUS.NF_ATRELADA,
  ORDER_STATUS.EXPEDIDO,
  ORDER_STATUS.FINALIZADO,
] as const satisfies readonly OrderStatus[];

export const INVOICE_STATUS = {
  NOT_FOUND: 'NOT_FOUND',
  PENDING: 'PENDING',
  INVOICED: 'INVOICED',
  PARTIAL: 'PARTIAL',
  RECEIVED: 'RECEIVED',
  CHARGE_RECEIPT: 'CHARGE_RECEIPT',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUS);
