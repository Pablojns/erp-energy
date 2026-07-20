'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { updatePurchaseStatus } from './compras-api';
import type { KanbanColumnId, PurchaseRequest } from './compras-types';
import { kanbanColumnForStatus } from './compras-utils';

/** Uma ação principal por coluna atual → próximo status do fluxo.
 *  Em SOLICITADO a aprovação fica no botão "Aprovar Requisição" (resolve modal). */
const STAGE_ACTIONS: Partial<
  Record<KanbanColumnId, { label: string; next: KanbanColumnId }>
> = {
  PEDIDO_ENVIADO_APROVADO: {
    label: '🛒 Marcar como Comprado',
    next: 'PEDIDO_PAGO',
  },
  PEDIDO_PAGO: {
    label: '📦 Confirmar Chegada',
    next: 'LAYOUT_APROVADO',
  },
  LAYOUT_APROVADO: {
    label: '🎨 Aprovar Layout',
    next: 'EM_PRODUCAO',
  },
  EM_PRODUCAO: {
    label: '🚚 Marcar como Expedido',
    next: 'EXPEDIDO',
  },
  EXPEDIDO: {
    label: '📥 Confirmar Recebimento',
    next: 'RECEBIDO',
  },
};

export function getComprasStageAction(row: PurchaseRequest) {
  const column = kanbanColumnForStatus(row.status);
  if (!column) return null;
  return STAGE_ACTIONS[column] ?? null;
}

export function ComprasStageActions(props: {
  row: PurchaseRequest;
  onStatusChanged: (updated: PurchaseRequest) => void;
  onError: (message: string) => void;
  onDone?: () => void;
  /** Mobile: stack full-width; desktop: inline in drawer */
  layout?: 'sheet' | 'inline';
}) {
  const action = getComprasStageAction(props.row);
  const [busy, setBusy] = useState(false);

  if (!action) return null;

  const handleAdvance = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await updatePurchaseStatus(props.row.id, action.next);
      props.onStatusChanged(updated);
      props.onDone?.();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Falha ao avançar etapa.');
    } finally {
      setBusy(false);
    }
  };

  const isSheet = props.layout === 'sheet';

  return (
    <div
      className={
        isSheet
          ? 'sticky bottom-0 z-10 -mx-4 mt-4 border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3'
          : 'mt-4'
      }
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleAdvance()}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-60 ${
          isSheet ? 'h-14' : 'h-12'
        }`}
        style={{ background: 'linear-gradient(to right, #2AACE2, #5BBFB0)' }}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
        {action.label}
      </button>
    </div>
  );
}
