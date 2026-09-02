import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Ids das 8 etapas seed. Mantido apenas como referência/documentação —
 * a validação agora é feita contra PurchaseStage, já que as etapas são
 * customizáveis (o admin pode criar/renomear/excluir etapas).
 */
export enum PurchaseWorkflowStatus {
  SOLICITADO = 'SOLICITADO',
  PEDIDO_ENVIADO_APROVADO = 'PEDIDO_ENVIADO_APROVADO',
  PEDIDO_PAGO = 'PEDIDO_PAGO',
  LAYOUT_APROVADO = 'LAYOUT_APROVADO',
  EM_PRODUCAO = 'EM_PRODUCAO',
  EXPEDIDO = 'EXPEDIDO',
  RECEBIDO = 'RECEBIDO',
  RECUSADO = 'RECUSADO',
}

export class UpdatePurchaseRequestStatusDto {
  /** Id da etapa de destino (PurchaseStage.id). */
  @IsString()
  @MaxLength(64)
  status!: string;

  /** Enviado quando a etapa de destino tem requiresPurchaseDetails. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  purchaseValue?: number;

  /** Enviado quando a etapa de destino tem requiresPurchaseDetails. */
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  /** Enviado quando a etapa de destino tem requiresReason. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  refusalReason?: string;
}
