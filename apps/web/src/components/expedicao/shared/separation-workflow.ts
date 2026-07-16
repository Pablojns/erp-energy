import type { OrderDto } from '@/src/components/expedicao/shared/types';

export const SEPARATION_WORKFLOW_STEPS = [
  { id: 1, label: 'Em separação', shortLabel: 'Em sep.' },
  { id: 2, label: 'Separando', shortLabel: 'Sep.' },
  { id: 3, label: 'NF-e', shortLabel: 'NF' },
  { id: 4, label: 'Etiqueta', shortLabel: 'Etq.' },
  { id: 5, label: 'Saída', shortLabel: 'Saída' },
] as const;

export type SeparationWorkflowStep = 1 | 2 | 3 | 4 | 5;

/**
 * Progresso visual do ciclo atual de separação — só o status do pedido conta.
 * Histórico / invoiceNumber de ciclos parciais anteriores NÃO avançam etapas.
 * FINALIZADO/EXPEDIDO é o único ponto em que o fluxo aparece concluído.
 */
export function resolveSeparationWorkflowStep(order: OrderDto): SeparationWorkflowStep {
  const status = order.status as string;

  if (status === 'FINALIZADO' || status === 'EXPEDIDO') return 5;

  if (status === 'NF_ATRELADA') return 4;

  if (status === 'SEPARADO' || status === 'AGUARDANDO_NF' || status === 'NF_PENDENTE') {
    return 3;
  }

  if (status === 'EM_SEPARACAO') return 2;

  // NOVO, RESERVADO, PARCIAL, etc. — ainda não no ciclo (ou resetado)
  return 1;
}

export function getSeparationWorkflowStepMeta(step: SeparationWorkflowStep) {
  return SEPARATION_WORKFLOW_STEPS[step - 1];
}
