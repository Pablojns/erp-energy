import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateSitePedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'Número do pedido no site é obrigatório.' })
  @MaxLength(64)
  externalOrderNumber!: string;

  @IsString()
  @IsNotEmpty({ message: 'Data de entrega prevista é obrigatória.' })
  @MaxLength(32)
  requestedDeliveryDate!: string;

  @IsUUID('4', { message: 'Cliente inválido.' })
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  deliveryCnpj?: string;

  @IsUUID('4', { message: 'Recebedor inválido.' })
  receiverId!: string;

  @IsUUID('4', { message: 'Ponto de descarga inválido.' })
  unloadingPointId!: string;

  @IsUUID('4', { message: 'Transportadora inválida.' })
  carrierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
