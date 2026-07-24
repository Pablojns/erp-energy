import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ORDER_STATUS_VALUES } from '../order-domain';

export class UpdatePedidoAdminItemDto {
  @IsUUID('4')
  id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineNumber?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mercadoEletronicoItemStatus?: string;
}

export class UpdatePedidoAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  receiverName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  unloadingPoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  deliveryCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orderDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  requestedDeliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  obsExpedicao?: string;

  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

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
  @MaxLength(32)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  totalValue?: string;

  @IsOptional()
  @IsUUID('4')
  carrierId?: string | null;

  @IsOptional()
  @IsUUID('4')
  companyEntityId?: string | null;

  /** Vincular cliente cadastrado (opcional) ao editar CNPJ do pedido WEG. */
  @IsOptional()
  @IsUUID('4')
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryAddress?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePedidoAdminItemDto)
  items?: UpdatePedidoAdminItemDto[];
}
