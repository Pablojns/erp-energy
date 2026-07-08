import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  PurchaseRequestPriority,
  PurchaseRequestType,
} from './create-purchase-request.dto';

const PURCHASE_LIST_STATUSES = [
  'SOLICITADO',
  'PEDIDO_ENVIADO_APROVADO',
  'PEDIDO_PAGO',
  'LAYOUT_APROVADO',
  'EM_PRODUCAO',
  'EXPEDIDO',
  'RECEBIDO',
  'COMPRADO',
  'RECUSADO',
] as const;

export class ListPurchaseRequestsQueryDto {
  @IsOptional()
  @IsEnum(PurchaseRequestType)
  type?: PurchaseRequestType;

  @IsOptional()
  @IsIn([...PURCHASE_LIST_STATUSES])
  status?: string;

  @IsOptional()
  @IsEnum(PurchaseRequestPriority)
  priority?: PurchaseRequestPriority;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
