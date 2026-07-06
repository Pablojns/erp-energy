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
import { CreateVendaExternaItemDto } from './create-venda-externa-item.dto';

export class CreateVendaExternaPedidoDto {
  @IsString()
  @IsNotEmpty({ message: 'Número do pedido é obrigatório.' })
  @MaxLength(64)
  externalOrderNumber!: string;

  @IsUUID('4', { message: 'Cliente inválido.' })
  customerId!: string;

  @IsString()
  @IsNotEmpty({ message: 'Data de entrega prevista é obrigatória.' })
  @MaxLength(32)
  requestedDeliveryDate!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Transportadora inválida.' })
  carrierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  notaRemessa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Informe ao menos um item.' })
  @ValidateNested({ each: true })
  @Type(() => CreateVendaExternaItemDto)
  items!: CreateVendaExternaItemDto[];
}
