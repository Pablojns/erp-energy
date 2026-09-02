import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  PurchaseRequestPriority,
  PurchaseRequestType,
} from './create-purchase-request.dto';

export class ListPurchaseRequestsQueryDto {
  @IsOptional()
  @IsEnum(PurchaseRequestType)
  type?: PurchaseRequestType;

  /** Id de etapa (PurchaseStage.id) ou status legado 'COMPRADO'. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  status?: string;

  @IsOptional()
  @IsEnum(PurchaseRequestPriority)
  priority?: PurchaseRequestPriority;

  /**
   * Termo do fornecedor. `supplierName` é texto livre, então a comparação é
   * parcial e case-insensitive (não exige cadastro em Supplier).
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplier?: string;

  /**
   * Gravador terceirizado (ex.: "Amanda"). Comparação parcial e case-insensitive
   * em `engravingVendor`, independente do fornecedor do produto.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  engravingVendor?: string;

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
