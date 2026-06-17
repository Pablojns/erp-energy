import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PedidosUpdateStatusDto {
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

