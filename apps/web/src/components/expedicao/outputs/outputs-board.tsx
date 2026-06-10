'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine,
  Download,
  History,
  Loader2,
  Package,
  Search,
} from 'lucide-react';
import { AnimatedTabs } from '@/src/components/shell/animated-tabs';
import { GlowButton } from '@/src/components/shell/glow-button';
import { ExpeditionHeader } from '@/src/components/expedicao/expedition/expedition-header';
import { formatBrlDisplay, formatDayDisplay } from '@/src/components/expedicao/expedition-wms-layout';
import type { OrderDto, PaginatedOrders } from '@/src/components/expedicao/shared/types';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type StockMovementRow = {
  id: string;
  movementType: string;
  quantity: number;
  createdAt: string;
  reference: string | null;
  notes: string | null;
  product?: { sku: string; name: string };
  user?: { name: string } | null;
};

type MovementsPage = {
  data: StockMovementRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export function OutputsBoard() {
  const [tab, setTab] = useState('auto');
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movLoading, setMovLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [manualSku, setManualSku] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualProductId, setManualProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const loadAuto = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await erpFetchJson<PaginatedOrders>(
        'orders?status=closed&page=1&pageSize=30&sortBy=orderDate&sortOrder=desc',
      );
      setOrders(res.data.filter((o) => o.invoiceNumber || o.status === 'FINALIZADO'));
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setMovLoading(true);
    try {
      const res = await erpFetchJson<MovementsPage>(
        'stock/movements?movementType=SAIDA_EXPEDICAO&page=1&pageSize=40',
      );
      setMovements(res.data);
    } catch {
      try {
        const res = await erpFetchJson<MovementsPage>(
          'stock/movements?page=1&pageSize=40',
        );
        setMovements(
          res.data.filter(
            (m) =>
              m.movementType === 'SAIDA_EXPEDICAO' ||
              m.movementType === 'OUTBOUND' ||
              m.movementType === 'BAIXA_EXPEDICAO',
          ),
        );
      } catch {
        setMovements([]);
      }
    } finally {
      setMovLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'auto') void loadAuto();
    if (tab === 'history') void loadHistory();
  }, [tab, loadAuto, loadHistory]);

  async function submitManualOutput() {
    if (!manualProductId.trim() || !manualQty.trim()) {
      setBanner('Informe produto (busque na aba Estoque) e quantidade.');
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: manualProductId.trim(),
          movementKind: 'saida',
          quantity: Math.abs(Number(manualQty)),
          reference: manualReason.trim() || 'Saída manual',
          notes: manualNotes.trim() || undefined,
        }),
      });
      setBanner('Saída manual registrada.');
      setManualQty('');
      void loadHistory();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Falha ao gerar saída.');
    } finally {
      setSaving(false);
    }
  }

  const filteredOrders = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const n = (o.externalOrderNumber ?? o.code).toLowerCase();
    return (
      n.includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.invoiceNumber ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="erp-expedition-page space-y-8">
      <ExpeditionHeader
        title="Saídas"
        subtitle="Baixa de estoque na expedição — automática ao finalizar com NF ou manual para ajustes operacionais."
        showWegActions={false}
        onRefresh={() => {
          if (tab === 'auto') void loadAuto();
          else if (tab === 'history') void loadHistory();
        }}
        refreshing={ordersLoading || movLoading}
        onOpenFilters={() => {}}
      />

      <AnimatedTabs
        tabs={[
          { id: 'auto', label: 'Saída automática' },
          { id: 'manual', label: 'Saída manual' },
          { id: 'history', label: 'Histórico' },
        ]}
        activeId={tab}
        onChange={setTab}
      />

      {banner ? (
        <p className="erp-alert-success rounded-xl px-4 py-2 text-sm">{banner}</p>
      ) : null}

      {tab === 'auto' ? (
        <section className="space-y-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-erp-fg-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido ou NF…"
              className="erp-input w-full rounded-xl py-2.5 pl-10 pr-3 text-[13px]"
            />
          </div>
          {ordersLoading ? (
            <div className="erp-surface flex h-40 items-center justify-center rounded-2xl">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--erp-accent)]" />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((o) => (
                <div key={o.id} className="erp-order-card erp-order-card--success rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-bold text-erp-fg">
                        {o.externalOrderNumber ?? o.code}
                      </p>
                      <p className="mt-1 text-[13px] text-erp-fg-secondary">
                        {o.customerName}
                      </p>
                      <p className="mt-2 font-mono text-[12px] text-erp-fg-muted">
                        NF: {o.invoiceNumber ?? '—'} ·{' '}
                        {formatDayDisplay(o.orderDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-erp-fg-muted">
                        Valor
                      </p>
                      <p className="font-mono text-[var(--erp-success)]">
                        {formatBrlDisplay(o.totalValue)}
                      </p>
                      <p className="mt-2 text-[11px] text-erp-fg-muted">
                        {o.itemCount} itens · {o.quantitySum} un.
                      </p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1 border-t border-erp-border pt-3 text-[12px] text-erp-fg-secondary">
                    {o.items.slice(0, 4).map((it) => (
                      <li key={it.id} className="flex justify-between gap-2">
                        <span className="truncate">
                          {it.sku} — {it.description}
                        </span>
                        <span className="font-mono shrink-0">
                          {it.pickedQty ?? it.reservedQuantity} un.
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {filteredOrders.length === 0 ? (
                <p className="text-center text-erp-fg-muted py-12">
                  Nenhuma saída automática recente.
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'manual' ? (
        <section className="erp-surface max-w-xl space-y-4 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-erp-fg">Saída manual</h2>
          <p className="text-[13px] text-erp-fg-muted">
            Gera movimentação <span className="font-mono">saida</span> via API de
            estoque. Informe o UUID do produto (copie em Estoque).
          </p>
          <label className="block">
            <span className="erp-field-legend">SKU (referência)</span>
            <input
              value={manualSku}
              onChange={(e) => setManualSku(e.target.value)}
              className="erp-input mt-1 w-full rounded-xl px-3 py-2.5 text-[13px]"
              placeholder="50020124"
            />
          </label>
          <label className="block">
            <span className="erp-field-legend">ID do produto (UUID)</span>
            <input
              value={manualProductId}
              onChange={(e) => setManualProductId(e.target.value)}
              className="erp-input mt-1 w-full rounded-xl px-3 py-2.5 font-mono text-[12px]"
            />
          </label>
          <label className="block">
            <span className="erp-field-legend">Quantidade</span>
            <input
              type="number"
              min={1}
              value={manualQty}
              onChange={(e) => setManualQty(e.target.value)}
              className="erp-input mt-1 w-full rounded-xl px-3 py-2.5 font-mono"
            />
          </label>
          <label className="block">
            <span className="erp-field-legend">Motivo</span>
            <input
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              className="erp-input mt-1 w-full rounded-xl px-3 py-2.5 text-[13px]"
            />
          </label>
          <label className="block">
            <span className="erp-field-legend">Observação</span>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              rows={3}
              className="erp-input mt-1 w-full rounded-xl px-3 py-2.5 text-[13px]"
            />
          </label>
          <GlowButton
            variant="primary"
            type="button"
            disabled={saving}
            className="w-full justify-center font-semibold"
            onClick={() => void submitManualOutput()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowDownToLine className="h-4 w-4" />
            )}
            Gerar saída manual
          </GlowButton>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <GlowButton variant="secondary" type="button" onClick={() => void loadHistory()}>
              <History className="h-4 w-4" /> Atualizar histórico
            </GlowButton>
            <button type="button" className="erp-chip-btn gap-2 px-4 py-2">
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>
          {movLoading ? (
            <div className="erp-surface flex h-40 items-center justify-center rounded-2xl">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-0">
              {movements.map((m) => (
                <div key={m.id} className="erp-timeline-item">
                  <div className="erp-card rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="erp-glow-badge erp-glow-badge--sm erp-glow-badge--info">
                        {m.movementType}
                      </span>
                      <time className="text-[12px] text-erp-fg-muted">
                        {new Date(m.createdAt).toLocaleString('pt-BR')}
                      </time>
                    </div>
                    <p className="mt-2 font-medium text-erp-fg">
                      {m.product?.sku ?? '—'} · {m.product?.name ?? 'Produto'}
                    </p>
                    <p className="mt-1 font-mono text-[13px] text-erp-fg-secondary">
                      {m.quantity.toLocaleString('pt-BR')} un.
                      {m.user?.name ? ` · ${m.user.name}` : ''}
                    </p>
                    {m.reference ? (
                      <p className="mt-1 text-[12px] text-erp-fg-muted">
                        Ref: {m.reference}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
              {movements.length === 0 ? (
                <p className="py-12 text-center text-erp-fg-muted">
                  Sem movimentações de saída registradas.
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
