'use client';

import { displayOrDash } from '@/src/components/expedicao/expedition-order-ux';
import type { OrderDto } from '@/src/components/expedicao/shared/types';

export function OrderInfoPanel(props: { order: OrderDto }) {
  const { order } = props;
  const cnpj = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const buyer = displayOrDash(order.customerName);
  const point = displayOrDash(order.unloadingPoint);
  const receiver = displayOrDash(order.receiverName);
  const address = displayOrDash(order.deliveryAddress);
  const notes = order.notes?.trim() || 'Sem observações.';
  const opObs = order.contaAzulStatus?.trim() || 'Não Encontrado';
  const wegObs = order.mercadoEletronicoStatus?.trim() || 'Sem recebimento';

  return (
    <div className="exp-wb-section-card exp-wb-order-data-card border-[var(--border-color)] bg-[var(--bg-card)]">
      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Comprador</p>
          <p className="exp-wb-order-data-value text-[var(--text-primary)]">{buyer}</p>
        </div>
        <p className="exp-wb-order-data-side text-[var(--text-primary)]">{cnpj}</p>
      </div>

      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Ponto de Descarga</p>
          <p className="exp-wb-order-data-value text-[var(--text-primary)]">{point}</p>
        </div>
        <p className="exp-wb-order-data-side text-[var(--text-primary)]">
          <span className="exp-wb-order-data-label-inline text-[var(--text-secondary)]">Recebedor:</span> {receiver}
        </p>
      </div>

      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Endereço</p>
          <p className={address === '—' ? 'exp-wb-order-data-empty text-[var(--text-muted)]' : 'exp-wb-order-data-value text-[var(--text-primary)]'}>
            {address}
          </p>
        </div>
      </div>

      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Observações</p>
          <p className={notes === 'Sem observações.' ? 'exp-wb-order-data-empty text-[var(--text-muted)]' : 'exp-wb-order-data-notes text-[var(--text-primary)]'}>
            {notes}
          </p>
          <p className="exp-wb-order-data-notes text-[var(--text-primary)]">
            <span className="exp-wb-order-data-label-inline text-[var(--text-secondary)]">Observações operacionais:</span>{' '}
            <span className="exp-wb-order-data-note-value text-[var(--text-primary)]">{opObs}</span>
          </p>
          <p className="exp-wb-order-data-notes text-[var(--text-primary)]">
            <span className="exp-wb-order-data-label-inline text-[var(--text-secondary)]">Observações da WEG:</span>{' '}
            <span className="exp-wb-order-data-note-value text-[var(--text-primary)]">{wegObs}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
