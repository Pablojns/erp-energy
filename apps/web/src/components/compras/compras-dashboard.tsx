'use client';

import { useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import { TableSkeleton } from '@/src/components/ui/skeleton';
import type { PurchaseRequest, PurchaseType } from './compras-types';
import { TYPE_LABEL, purchaseStatusLabel } from './compras-types';
import {
  calcEngravingTotalFromRow,
  calcPaidTotalFromRow,
  calcPurchaseTotalFromRow,
  displayName,
  displayQty,
  formatDate,
  formatMoney,
  formatMoneyNumber,
  productBaseCost,
  purchaseUnitPrice,
} from './compras-utils';

type DashboardType = Extract<PurchaseType, 'VENDA_EXTERNA' | 'WEG_CONTRATO'>;

const DASHBOARD_TYPES: Array<{ id: DashboardType; label: string; hint: string }> = [
  {
    id: 'VENDA_EXTERNA',
    label: 'Venda Externa',
    hint: 'Itens comprados para pedidos externos.',
  },
  {
    id: 'WEG_CONTRATO',
    label: 'WEG',
    hint: 'Requisições de produtos WEG por contrato.',
  },
];

function sumMoney(values: Array<number | null>): number | null {
  const total = values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  return total > 0 ? total : null;
}

function basePriceTotal(row: PurchaseRequest): number | null {
  const price = row.type === 'WEG_CONTRATO' ? purchaseUnitPrice(row) : row.itemPrice;
  const numericPrice = price ? Number(price) : 0;
  const quantity = displayQty(row);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0 || quantity <= 0) return null;
  return numericPrice * quantity;
}

function moduleSummary(rows: PurchaseRequest[]) {
  return {
    total: rows.length,
    paid: sumMoney(rows.map(calcPaidTotalFromRow)),
    base: sumMoney(rows.map(basePriceTotal)),
    item: sumMoney(rows.map(calcPurchaseTotalFromRow)),
    engraving: sumMoney(rows.map(calcEngravingTotalFromRow)),
  };
}

export function ComprasDashboard(props: { rows: PurchaseRequest[]; loading: boolean }) {
  const { rows, loading } = props;
  const [selectedType, setSelectedType] = useState<DashboardType>('VENDA_EXTERNA');

  const grouped = useMemo(() => {
    return DASHBOARD_TYPES.reduce(
      (acc, item) => {
        acc[item.id] = rows.filter((row) => row.type === item.id);
        return acc;
      },
      {} as Record<DashboardType, PurchaseRequest[]>,
    );
  }, [rows]);

  const selectedRows = grouped[selectedType];
  const selectedSummary = moduleSummary(selectedRows);

  return (
    <section className="erp-module-panel min-h-0 flex-1 overflow-hidden p-3">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-2">
          {DASHBOARD_TYPES.map((item) => {
            const summary = moduleSummary(grouped[item.id]);
            const active = selectedType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedType(item.id)}
                className={`erp-module-card p-4 text-left transition ${
                  active
                    ? 'border-[color-mix(in_srgb,var(--erp-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--erp-accent)_10%,transparent)]'
                    : 'hover:border-[color-mix(in_srgb,var(--erp-accent)_30%,transparent)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--erp-fg)]">{item.label}</p>
                    <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">{item.hint}</p>
                  </div>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-[var(--erp-fg-secondary)]">
                    {summary.total} req.
                  </span>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Metric label="Valor pago" value={formatMoneyNumber(summary.paid)} />
                  <Metric
                    label={item.id === 'WEG_CONTRATO' ? 'Preço base' : 'Preço item'}
                    value={formatMoneyNumber(item.id === 'WEG_CONTRATO' ? summary.base : summary.item)}
                  />
                  <Metric label="Gravação" value={formatMoneyNumber(summary.engraving)} />
                  <Metric label="Em aberto" value={String(summary.total)} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="erp-module-card flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <div className="mb-3 shrink-0 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[var(--erp-fg)]">
                Dashboard {TYPE_LABEL[selectedType]}
              </h2>
              <p className="text-xs text-[var(--erp-fg-muted)]">
                Valores consolidados por requisição, sem alterar o fluxo de compras.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <SummaryPill label="Pago" value={formatMoneyNumber(selectedSummary.paid)} />
              <SummaryPill
                label={selectedType === 'WEG_CONTRATO' ? 'Base' : 'Itens'}
                value={formatMoneyNumber(
                  selectedType === 'WEG_CONTRATO' ? selectedSummary.base : selectedSummary.item,
                )}
              />
              <SummaryPill label="Gravação" value={formatMoneyNumber(selectedSummary.engraving)} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gray-200">
            <div className="sticky top-0 z-10 grid min-w-[58rem] grid-cols-[1.3fr_0.55fr_0.75fr_0.75fr_0.75fr_0.75fr] border-b border-gray-200 bg-[var(--erp-surface-elevated)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--erp-fg-muted)] shadow-sm">
              <span>Item</span>
              <span>Qtd.</span>
              <span>{selectedType === 'WEG_CONTRATO' ? 'Preço base' : 'Preço item'}</span>
              <span>Gravação</span>
              <span>Valor pago</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="px-3 py-4">
                <TableSkeleton rows={6} columns={6} header={false} />
              </div>
            ) : selectedRows.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={ShoppingCart}
                  title="Nenhuma requisição encontrada"
                  description="As solicitações de compra deste módulo aparecerão aqui conforme forem criadas."
                />
              </div>
            ) : (
              selectedRows.map((row) => (
                <div
                  key={row.id}
                  className="grid min-w-[58rem] grid-cols-[1.3fr_0.55fr_0.75fr_0.75fr_0.75fr_0.75fr] items-center border-t border-gray-200 px-3 py-2 text-sm text-[var(--erp-fg-secondary)]"
                >
                  <div>
                    <p className="font-medium text-[var(--erp-fg)]">{displayName(row)}</p>
                    <p className="text-xs text-[var(--erp-fg-muted)]">
                      {selectedType === 'WEG_CONTRATO'
                        ? row.product?.sku ?? 'Sem SKU'
                        : row.sku ?? row.product?.sku ?? 'Sem SKU'}
                      {selectedType === 'WEG_CONTRATO' && row.sku
                        ? ` · Forn. ${row.sku}`
                        : ''}
                      {' · '}
                      {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <span>{displayQty(row)}</span>
                  <span>
                    {selectedType === 'WEG_CONTRATO'
                      ? formatMoneyNumber(Number(purchaseUnitPrice(row)))
                      : formatMoney(row.itemPrice)}
                  </span>
                  <span>{formatMoney(row.engravingPrice)}</span>
                  <span>{formatMoney(row.purchaseValue)}</span>
                  <span>{purchaseStatusLabel(row.status)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-[var(--erp-fg-muted)]">{props.label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--erp-fg)]">{props.value}</p>
    </div>
  );
}

function SummaryPill(props: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[var(--erp-fg-secondary)]">
      {props.label}: <strong className="text-[var(--erp-fg)]">{props.value}</strong>
    </span>
  );
}
