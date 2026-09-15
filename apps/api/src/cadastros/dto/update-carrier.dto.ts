import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCarrierDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deliveryAddress?: string | null;
}
