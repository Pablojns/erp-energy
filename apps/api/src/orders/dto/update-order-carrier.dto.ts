import { IsOptional, IsUUID } from 'class-validator';

export class UpdateOrderCarrierDto {
  @IsOptional()
  @IsUUID('4')
  carrierId?: string | null;
}
