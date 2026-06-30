import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateManualPedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'Número do pedido é obrigatório.' })
  @MaxLength(64)
  externalOrderNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'Data de entrega prevista é obrigatória.' })
  @MaxLength(32)
  requestedDeliveryDate!: string;

  @IsUUID('4', { message: 'Recebedor inválido.' })
  receiverId!: string;

  @IsUUID('4', { message: 'Cliente (CNPJ de entrega) inválido.' })
  customerId!: string;

  @IsUUID('4', { message: 'Ponto de descarga inválido.' })
  unloadingPointId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isUrgentManual?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
