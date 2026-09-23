import { ArrayMinSize, IsArray, IsOptional, IsUUID } from 'class-validator';

export class SendToPickingDto {
  /** Quando informado, reserva/envia só estas linhas (separação parcial por item). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  itemIds?: string[];
}
