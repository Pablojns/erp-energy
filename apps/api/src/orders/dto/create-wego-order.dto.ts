import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateWegOrderItemDto } from './create-wego-order-item.dto';

/** Pedido WEG / Mercado Eletrônico manual de teste — sem reserva automática. */
export class CreateWegOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  externalOrderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mercadoEletronicoNumber?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerDocument?: string;

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
  @MaxLength(120)
  deliveryCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  deliveryState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  orderDate?: string;

  @IsOptional()
  @IsString()
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mercadoEletronicoStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contaAzulStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  invoiceNumber?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWegOrderItemDto)
  items!: CreateWegOrderItemDto[];
}
