'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Search, X } from 'lucide-react';
import { GlassCard } from '@/src/components/shell/glass-card';
import { GlowButton } from '@/src/components/shell/glow-button';
import { sortProductsForSearch } from '@/src/lib/product-search';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import type { BusinessContext } from '@/src/lib/business-context';
import {
  fetchAllStockProducts,
  type EstoqueBulkProduct,
} from '@/src/components/estoque/estoque-product-fetch';

type Step = 'select' | 'quantities';

export function EstoqueBulkEntradaModal(props: {
  open: boolean;
  businessContext: BusinessContext;
  onClose: () => void;
  onDone: (created: number) => void;
  onError: (message: string) => void;
}) {
  const { open, businessContext, onClose, onDone, onError } = props;
  const [step, setStep] = useState<Step>('select');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<EstoqueBulkProduct[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [qtyById, setQtyById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setStep('select');
    setSearch('');
    setSelectedIds(new Set());
    setQtyById({});
    void fetchAllStockProducts({ businessContext, includeInactive: false })
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          onError(
            e instanceof Error
              ? e.message
              : 'Falha ao carregar produtos para entrada em massa.',
          );
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open + businessContext
  }, [open, businessContext]);

  const filtered = useMemo(
    () => sortProductsForSearch(products, search),
    [products, search],
  );

  const selectedList = useMemo(
    () => products.filter((p) => selectedIds.has(p.id)),
    [products, selectedIds],
  );

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    const visibleIds = filtered.map((p) => p.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  const goToQuantities = () => {
    if (selectedIds.size === 0) {
      onError('Selecione ao menos um produto.');
      return;
    }
    setQtyById((prev) => {
      const next: Record<string, string> = {};
      for (const id of selectedIds) {
        next[id] = prev[id] ?? '';
      }
      return next;
    });
    setStep('quantities');
  };

  const confirm = async () => {
    if (selectedList.length === 0) {
      onError('Selecione ao menos um produto.');
      return;
    }
    const payload: Array<{ productId: string; quantity: number }> = [];
    for (const p of selectedList) {
      const raw = (qtyById[p.id] ?? '').trim();
      if (!/^\d+$/.test(raw) || Number.parseInt(raw, 10) <= 0) {
        onError(`Informe uma quantidade válida para ${p.name} (${p.sku}).`);
        return;
      }
      payload.push({
        productId: p.id,
        quantity: Number.parseInt(raw, 10),
      });
    }

    setSaving(true);
    try {
      for (const row of payload) {
        await erpFetchJson('stock/movements', {
          method: 'POST',
          body: JSON.stringify({
            productId: row.productId,
            movementKind: 'entrada',
            movementType: 'INBOUND',
            quantity: row.quantity,
            notes: 'Entrada em massa',
          }),
        });
      }
      onDone(payload.length);
      onClose();
    } catch (e) {
      onError(
        e instanceof Error
          ? e.message
          : 'Falha ao registrar entrada em massa.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="flex h-[92dvh] w-full max-w-3xl flex-col sm:h-auto sm:max-h-[90vh]">
        <GlassCard className="flex min-h-0 flex-1 flex-col border-gray-200 p-3 shadow-2xl sm:p-5">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Entrada em Massa
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {step === 'select'
                  ? '1/2 — Busque e marque os produtos. As quantidades vêm no próximo passo.'
                  : `2/2 — Informe a quantidade de cada um dos ${selectedList.length} produto(s) selecionado(s).`}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              aria-label="Fechar"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {step === 'select' ? (
            <>
              <div className="relative mt-3 shrink-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder='Buscar (ex: "camisa polo")…'
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="mt-3 flex shrink-0 items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleVisible(e.target.checked)}
                    disabled={loading || filtered.length === 0}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  Selecionar visíveis ({filtered.length})
                </label>
                <span>{selectedIds.size} selecionado(s)</span>
              </div>

              <div className="erp-scrollbar mt-2 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-[var(--text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando produtos…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
                    Nenhum produto encontrado.
                  </p>
                ) : (
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                      <tr>
                        <th className="w-10 px-2 py-2" />
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2">Produto</th>
                        <th className="px-2 py-2 text-right">Estoque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => {
                        const checked = selectedIds.has(p.id);
                        return (
                          <tr
                            key={p.id}
                            className="border-t border-[var(--border-color)]"
                          >
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleId(p.id)}
                                className="h-3.5 w-3.5 accent-[var(--accent)]"
                              />
                            </td>
                            <td className="px-2 py-2 font-mono text-xs text-[var(--text-primary)]">
                              {p.sku}
                            </td>
                            <td className="px-2 py-2 text-[var(--text-primary)]">
                              {p.name}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                              {p.stockQty}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-3 flex shrink-0 justify-end gap-2">
                <GlowButton variant="secondary" onClick={onClose}>
                  Cancelar
                </GlowButton>
                <GlowButton
                  variant="primary"
                  disabled={selectedIds.size === 0 || loading}
                  onClick={goToQuantities}
                >
                  Continuar ({selectedIds.size})
                </GlowButton>
              </div>
            </>
          ) : (
            <>
              <div className="erp-scrollbar mt-3 min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--border-color)]">
                <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                  <thead className="sticky top-0 bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-2 py-2">SKU</th>
                      <th className="px-2 py-2">Produto</th>
                      <th className="px-2 py-2 text-right">Estoque atual</th>
                      <th className="px-2 py-2 text-right">Qtd entrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedList.map((p, idx) => (
                      <tr
                        key={p.id}
                        className="border-t border-[var(--border-color)]"
                      >
                        <td className="px-2 py-2 font-mono text-xs text-[var(--text-primary)]">
                          {p.sku}
                        </td>
                        <td className="px-2 py-2 text-[var(--text-primary)]">
                          {p.name}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-secondary)]">
                          {p.stockQty}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            autoFocus={idx === 0}
                            disabled={saving}
                            value={qtyById[p.id] ?? ''}
                            onChange={(e) =>
                              setQtyById((q) => ({
                                ...q,
                                [p.id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                            className="w-28 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2 py-1.5 text-right text-sm tabular-nums outline-none disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex shrink-0 flex-wrap justify-between gap-2">
                <GlowButton
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setStep('select')}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar à seleção
                </GlowButton>
                <div className="flex gap-2">
                  <GlowButton
                    variant="secondary"
                    disabled={saving}
                    onClick={onClose}
                  >
                    Cancelar
                  </GlowButton>
                  <GlowButton
                    variant="primary"
                    disabled={saving || selectedList.length === 0}
                    onClick={() => void confirm()}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Registrando…
                      </>
                    ) : (
                      'Confirmar Entrada em Massa'
                    )}
                  </GlowButton>
                </div>
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
