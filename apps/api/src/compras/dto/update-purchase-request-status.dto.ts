import { IsEnum } from 'class-validator';

export enum PurchaseWorkflowStatus {
  SOLICITADO = 'SOLICITADO',
  PEDIDO_ENVIADO_APROVADO = 'PEDIDO_ENVIADO_APROVADO',
  PEDIDO_PAGO = 'PEDIDO_PAGO',
  LAYOUT_APROVADO = 'LAYOUT_APROVADO',
  EM_PRODUCAO = 'EM_PRODUCAO',
  EXPEDIDO = 'EXPEDIDO',
  RECEBIDO = 'RECEBIDO',
}

export class UpdatePurchaseRequestStatusDto {
  @IsEnum(PurchaseWorkflowStatus)
  status!: PurchaseWorkflowStatus;
}
