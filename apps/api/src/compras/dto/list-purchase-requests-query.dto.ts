import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  PurchaseRequestPriority,
  PurchaseRequestType,
} from './create-purchase-request.dto';

export enum PurchaseRequestStatus {
  SOLICITADO = 'SOLICITADO',
  COMPRADO = 'COMPRADO',
  RECUSADO = 'RECUSADO',
}

export class ListPurchaseRequestsQueryDto {
  @IsOptional()
  @IsEnum(PurchaseRequestType)
  type?: PurchaseRequestType;

  @IsOptional()
  @IsEnum(PurchaseRequestStatus)
  status?: PurchaseRequestStatus;

  @IsOptional()
  @IsEnum(PurchaseRequestPriority)
  priority?: PurchaseRequestPriority;

  @IsOptional()
  @IsString()
  search?: string;

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
