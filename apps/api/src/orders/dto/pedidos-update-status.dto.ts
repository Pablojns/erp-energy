import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORDER_STATUS_VALUES } from '../order-domain';

export class PedidosUpdateStatusDto {
  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  status_me?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  status_ca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  obsExpedicao?: string;
}

