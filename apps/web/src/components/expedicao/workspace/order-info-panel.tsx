'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { formatDeliveryAddressDisplay } from '@/src/components/cadastros/delivery-address';
import { displayOrDash } from '@/src/components/expedicao/shared/order-helpers';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type CarrierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

export function OrderInfoPanel(props: {
  order: OrderDto;
  onCarrierChange?: (carrierId: string | null) => void | Promise<void>;
  carrierSaving?: boolean;
}) {
  const { order, onCarrierChange, carrierSaving = false } = props;
  const cnpj = displayOrDash(order.deliveryCnpj ?? order.customerDocument);
  const buyer = displayOrDash(order.customerName);
  const point = displayOrDash(order.unloadingPoint);
  const receiver = displayOrDash(order.receiverName);
  const address = formatDeliveryAddressDisplay(order.deliveryAddress);
  const notes = order.notes?.trim() || 'Sem observações.';

  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [carriersLoading, setCarriersLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCarriersLoading(true);
    void erpFetchJson<CarrierOption[]>('cadastros/carriers')
      .then((rows) => {
        if (!cancelled) {
          setCarriers(rows.filter((c) => c.isActive));
        }
      })
      .catch(() => {
        if (!cancelled) setCarriers([]);
      })
      .finally(() => {
        if (!cancelled) setCarriersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const carrierOptions = [
    { value: '', label: '— Selecionar transportadora —' },
    ...carriers.map((c) => ({ value: c.id, label: c.name })),
  ];

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
          <span className="exp-wb-order-data-label-inline text-[var(--text-secondary)]">Recebedor:</span>{' '}
          {receiver}
        </p>
      </div>

      <div className="exp-wb-order-data-row">
        <div className="min-w-0 flex-1">
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Transportadora</p>
          {onCarrierChange ? (
            <div className="mt-1 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <PremiumSelect
                  value={order.carrierId ?? ''}
                  onChange={(value) => {
                    void onCarrierChange(value.trim() ? value : null);
                  }}
                  options={carrierOptions}
                  placeholder="Selecionar transportadora…"
                  disabled={carrierSaving || carriersLoading}
                />
              </div>
              {carrierSaving || carriersLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-secondary)]" />
              ) : null}
            </div>
          ) : (
            <p className="exp-wb-order-data-value text-[var(--text-primary)]">
              {displayOrDash(order.carrierName)}
            </p>
          )}
        </div>
      </div>

      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Endereço</p>
          <p
            className={
              address === '—'
                ? 'exp-wb-order-data-empty text-[var(--text-muted)]'
                : 'exp-wb-order-data-value text-[var(--text-primary)]'
            }
          >
            {address}
          </p>
        </div>
      </div>

      <div className="exp-wb-order-data-row">
        <div>
          <p className="exp-wb-order-data-label text-[var(--text-secondary)]">Observações</p>
          <p
            className={
              notes === 'Sem observações.'
                ? 'exp-wb-order-data-empty text-[var(--text-muted)]'
                : 'exp-wb-order-data-notes text-[var(--text-primary)]'
            }
          >
            {notes}
          </p>
        </div>
      </div>
    </div>
  );
}
