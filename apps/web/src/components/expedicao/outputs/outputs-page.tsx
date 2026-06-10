'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, History, Loader2 } from 'lucide-react';
import { AnimatedTabs } from '@/src/components/shell/animated-tabs';
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
  meta: { total: number };
};

export function OutputsPage() {
  const [tab, setTab] = useState('manual');
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [manualProductId, setManualProductId] = useState('');
  const [manualSku, setManualSku] = useState('');
  const [manualQty, setManualQty] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await erpFetchJson<MovementsPage>(
        'stock/movements?page=1&pageSize=50',
      );
      const filtered = res.data.filter(
        (m) =>
          m.movementType === 'SAIDA_EXPEDICAO' ||
          m.movementType === 'OUTBOUND' ||
          m.movementType === 'BAIXA_EXPEDICAO' ||
          m.movementType === 'INBOUND',
      );
      setMovements(filtered);
    } catch {
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'history') void loadHistory();
  }, [tab, loadHistory]);

  async function submitManual() {
    if (!manualProductId.trim() || !manualQty.trim()) {
      setBanner('Informe o ID do produto (UUID) e a quantidade.');
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
          reference: manualReason.trim() || `Saída manual${manualSku ? ` · ${manualSku}` : ''}`,
          notes: manualNotes.trim() || undefined,
        }),
      });
      setBanner('Saída manual registrada com sucesso.');
      setManualQty('');
      setTab('history');
      void loadHistory();
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Falha ao registrar saída.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Saídas</h1>
        <p className="mt-1 text-[14px] text-[var(--text-secondary)]">
          Saída automática ao finalizar separação com NF. Registre saídas manuais e
          consulte o histórico.
        </p>
      </header>

      <AnimatedTabs
        tabs={[
          { id: 'manual', label: 'Saída manual' },
          { id: 'history', label: 'Histórico de saídas' },
        ]}
        activeId={tab}
        onChange={setTab}
        className="!border-[var(--border-color)] !bg-[var(--bg-card)]"
      />

      {banner ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {banner}
        </p>
      ) : null}

      {tab === 'manual' ? (
        <section className="max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Registrar saída manual</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">SKU</span>
              <input
                value={manualSku}
                onChange={(e) => setManualSku(e.target.value)}
                className="exp-light-input mt-1 w-full px-3 py-2.5 text-[13px]"
                placeholder="50020124"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">
                ID do produto (UUID)
              </span>
              <input
                value={manualProductId}
                onChange={(e) => setManualProductId(e.target.value)}
                className="exp-light-input mt-1 w-full px-3 py-2.5 font-mono text-[12px]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">Quantidade</span>
              <input
                type="number"
                min={1}
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
                className="exp-light-input mt-1 w-full px-3 py-2.5 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">Motivo</span>
              <input
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="exp-light-input mt-1 w-full px-3 py-2.5 text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-[var(--text-secondary)]">Observação</span>
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={3}
                className="exp-light-input mt-1 w-full px-3 py-2.5 text-[13px]"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              className="exp-light-btn-primary w-full"
              onClick={() => void submitManual()}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-4 w-4" />
              )}
              Registrar saída manual
            </button>
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Histórico de saídas</h2>
            <button
              type="button"
              className="exp-light-btn-secondary"
              onClick={() => void loadHistory()}
            >
              <History className="h-4 w-4" />
              Atualizar
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            </div>
          ) : movements.length === 0 ? (
            <p className="py-12 text-center text-[var(--text-secondary)]">Nenhuma movimentação encontrada.</p>
          ) : (
            <div className="space-y-0">
              {movements.map((m) => {
                const isAuto =
                  m.movementType === 'SAIDA_EXPEDICAO' ||
                  m.movementType === 'BAIXA_EXPEDICAO';
                return (
                  <div key={m.id} className="erp-timeline-item">
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-hover)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={`exp-light-badge ${isAuto ? 'exp-light-badge--status' : 'exp-light-badge--warn'}`}
                        >
                          {isAuto ? 'Automática' : 'Manual'}
                        </span>
                        <time className="text-[12px] text-[var(--text-secondary)]">
                          {new Date(m.createdAt).toLocaleString('pt-BR')}
                        </time>
                      </div>
                      <p className="mt-2 font-medium text-[var(--text-primary)]">
                        {m.product?.sku ?? '—'} · {m.product?.name ?? 'Produto'}
                      </p>
                      <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
                        <span className="font-mono font-semibold">
                          {m.quantity.toLocaleString('pt-BR')} un.
                        </span>
                        {m.user?.name ? ` · ${m.user.name}` : ''}
                      </p>
                      {m.reference ? (
                        <p className="mt-1 text-[12px] text-[var(--text-secondary)]">NF/Pedido: {m.reference}</p>
                      ) : null}
                      {m.notes ? (
                        <p className="mt-1 text-[12px] text-[var(--text-muted)]">{m.notes}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
