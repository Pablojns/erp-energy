import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export enum PurchaseRequestType {
  WEG_CONTRATO = 'WEG_CONTRATO',
  VENDA_EXTERNA = 'VENDA_EXTERNA',
  MARKETPLACE = 'MARKETPLACE',
}

export enum PurchaseRequestPriority {
  URGENTE = 'URGENTE',
  NORMAL = 'NORMAL',
}

export class CreatePurchaseRequestDto {
  @IsEnum(PurchaseRequestType)
  type!: PurchaseRequestType;

  @IsOptional()
  @IsEnum(PurchaseRequestPriority)
  priority?: PurchaseRequestPriority;

  @ValidateIf((o: CreatePurchaseRequestDto) => o.type === PurchaseRequestType.WEG_CONTRATO)
  @IsUUID('4', { message: 'Produto inválido.' })
  productId?: string;

  @ValidateIf((o: CreatePurchaseRequestDto) => o.type === PurchaseRequestType.WEG_CONTRATO)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  suggestedQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ValidateIf(
    (o: CreatePurchaseRequestDto) =>
      o.type === PurchaseRequestType.VENDA_EXTERNA ||
      o.type === PurchaseRequestType.MARKETPLACE,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  itemName?: string;

  @ValidateIf(
    (o: CreatePurchaseRequestDto) =>
      o.type === PurchaseRequestType.VENDA_EXTERNA ||
      o.type === PurchaseRequestType.MARKETPLACE,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  clientDeadline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplierName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  itemPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  engravingPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  saleOrderRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observation?: string;
}
