import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

import {
  INVOICE_STATUS_VALUES,
  ORDER_SOURCE_VALUES,
  ORDER_STATUS_VALUES,
} from '../order-domain';

export const ORDER_WORKSPACE_PRESETS = [
  'separation',
  'invoices',
  'billing',
  'pendencies',
] as const;
export type OrderWorkspacePreset = (typeof ORDER_WORKSPACE_PRESETS)[number];
const SORT_FIELDS = [
  'createdAt',
  'orderDate',
  'requestedDeliveryDate',
  'code',
  'externalOrderNumber',
  'totalValue',
  'priority',
  'status',
] as const;

export class OrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @IsIn([...ORDER_SOURCE_VALUES, 'all'])
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalOrderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  deliveryCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  unloadingPoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    ...ORDER_STATUS_VALUES,
    'active',
    'delayed',
    'urgent',
    'today',
    'week',
    'closed',
    'all',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contaAzulStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @IsIn([...INVOICE_STATUS_VALUES, 'all'])
  invoiceStatus?: string;

  /** Subconjuntos da área operacional (aba Expedição): separação, notas ou cobranças. */
  @IsOptional()
  @IsString()
  @IsIn([...ORDER_WORKSPACE_PRESETS])
  workspace?: OrderWorkspacePreset;

  @IsOptional()
  @IsString()
  orderDateFrom?: string;

  @IsOptional()
  @IsString()
  orderDateTo?: string;

  @IsOptional()
  @IsString()
  deliveryDateFrom?: string;

  @IsOptional()
  @IsString()
  deliveryDateTo?: string;

  /** Busca ampla em código, número externo, ME, SKU (item), recebedor, CNPJ */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  @IsIn([...SORT_FIELDS])
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: string;
}
