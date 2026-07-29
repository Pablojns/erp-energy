import { IsNotEmpty, IsUUID } from 'class-validator';

export class ConfirmarVinculoUrgenteDto {
  /** Pedido candidato a vincular (o outro lado do par urgente ↔ ME/venda externa). */
  @IsUUID('4')
  @IsNotEmpty()
  candidateOrderId!: string;
}
