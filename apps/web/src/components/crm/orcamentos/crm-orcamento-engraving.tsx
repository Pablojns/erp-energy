'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  createEngravingTechnique,
  deleteEngravingTechnique,
  formatQuoteCurrency,
  importEngravingExcel,
  listEngravingTechniques,
  updateEngravingTechnique,
  type EngravingImportSummary,
  type EngravingPriceTierDto,
  type EngravingTechniqueDto,
} from '@/src/services/api/quotes-api';

type TierDraft = {
  qtyFrom: string;
  qtyTo: string;
  cost: string;
  costType: 'Unidade' | 'Intervalo';
  fixedFee: string;
  applicationCost: string;
};

const EMPTY_TIER: TierDraft = {
  qtyFrom: '1',
  qtyTo: '99',
  cost: '0',
  costType: 'Unidade',
  fixedFee: '0',
  applicationCost: '0',
};

function parseMaybeNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const normalized = s.replace(/\s/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatOptionalCurrencyDash(v: string | number | null | undefined): string {
  const n = parseMaybeNumber(v);
  if (n === null) return '-';
  if (Math.abs(n) < 1e-12) return '-';
  return formatQuoteCurrency(n);
}

function tiersToDraft(tiers: EngravingPriceTierDto[]): TierDraft[] {
  if (!tiers.length) return [{ ...EMPTY_TIER }];
  return tiers.map((t) => ({
    qtyFrom: String(t.qtyFrom),
    qtyTo: String(t.qtyTo),
    cost: t.cost,
    costType: t.costType,
    fixedFee: t.fixedFee,
    applicationCost: t.applicationCost,
  }));
}

function parseTiers(drafts: TierDraft[]) {
  return drafts.map((t) => ({
    qtyFrom: Number(t.qtyFrom) || 0,
    qtyTo: Number(t.qtyTo) || 0,
    cost: Number(String(t.cost).replace(',', '.')) || 0,
    costType: t.costType,
    fixedFee: Number(String(t.fixedFee).replace(',', '.')) || 0,
    applicationCost: Number(String(t.applicationCost).replace(',', '.')) || 0,
  }));
}

export function CrmOrcamentoEngraving() {
  const [rows, setRows] = useState<EngravingTechniqueDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierDraft[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newCalculationType, setNewCalculationType] = useState('Unidade/Intervalo');
  const [newMultiplyColors, setNewMultiplyColors] = useState(false);
  const [newTiers, setNewTiers] = useState<TierDraft[]>([{ ...EMPTY_TIER }]);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<EngravingImportSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listEngravingTechniques();
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar gravações.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (row: EngravingTechniqueDto) => {
    setExpandedId((prev) => {
      const nextExpanded = prev === row.id ? null : row.id;
      // Ao abrir, sempre refaz o rascunho a partir do `row.tiers` recebido da API.
      if (nextExpanded) {
        setTierDrafts((prevDrafts) => ({
          ...prevDrafts,
          [row.id]: tiersToDraft(row.tiers),
        }));
      }
      return nextExpanded;
    });
  };

  const handleSaveTiers = async (row: EngravingTechniqueDto) => {
    const drafts = tierDrafts[row.id] ?? tiersToDraft(row.tiers);
    setSavingId(row.id);
    setError(null);
    try {
      const updated = await updateEngravingTechnique(row.id, {
        tiers: parseTiers(drafts),
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      setTierDrafts((prev) => ({ ...prev, [row.id]: tiersToDraft(updated.tiers) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar faixas.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (row: EngravingTechniqueDto) => {
    setTogglingId(row.id);
    setError(null);
    try {
      const updated = await updateEngravingTechnique(row.id, {
        active: !row.active,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (row: EngravingTechniqueDto) => {
    if (!window.confirm(`Excluir a técnica "${row.name}"?`)) return;
    setError(null);
    try {
      await deleteEngravingTechnique(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      if (expandedId === row.id) setExpandedId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir técnica.');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError('Informe o nome da técnica.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await createEngravingTechnique({
        name: newName.trim(),
        calculationType: newCalculationType.trim() || 'Unidade/Intervalo',
        multiplyColors: newMultiplyColors,
        supplierCompany: newSupplier.trim() || null,
        tiers: parseTiers(newTiers),
      });
      setRows((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNew(false);
      setNewName('');
      setNewSupplier('');
      setNewCalculationType('Unidade/Intervalo');
      setNewMultiplyColors(false);
      setNewTiers([{ ...EMPTY_TIER }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar técnica.');
    } finally {
      setCreating(false);
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setError(null);
    setImportSummary(null);
    try {
      const summary = await importEngravingExcel(file);
      setImportSummary(summary);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar planilha.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addTierDraft = (techniqueId: string) => {
    setTierDrafts((prev) => ({
      ...prev,
      [techniqueId]: [...(prev[techniqueId] ?? []), { ...EMPTY_TIER }],
    }));
  };

  const removeTierDraft = (techniqueId: string, index: number) => {
    setTierDrafts((prev) => {
      const current = [...(prev[techniqueId] ?? [])];
      if (current.length <= 1) return prev;
      current.splice(index, 1);
      return { ...prev, [techniqueId]: current };
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--erp-border)] p-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--erp-fg)]">Gravações</h2>
          <p className="text-xs text-[var(--erp-fg-muted)]">
            Técnicas e faixas de preço (base Brinde)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="erp-focus-ring inline-flex items-center gap-2 rounded-lg border border-[var(--erp-border)] px-3 py-2 text-sm font-medium text-[var(--erp-fg)] hover:bg-[var(--erp-bg-hover)] disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Importar Excel
          </button>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="erp-focus-ring inline-flex items-center gap-2 rounded-lg bg-[#2AACE2] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nova Técnica
          </button>
        </div>
      </div>

      {importSummary ? (
        <div className="mx-3 mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Importação concluída: {importSummary.criadas} criadas,{' '}
          {importSummary.atualizadas} atualizadas, {importSummary.faixas} faixas.
          {importSummary.erros.length > 0 ? (
            <span className="block text-xs text-emerald-900">
              {importSummary.erros.length} erro(s) — {importSummary.erros.slice(0, 3).join(' · ')}
            </span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mx-3 mt-3 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      {showNew ? (
        <div className="mx-3 mt-3 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-bg)] p-3">
          <h3 className="mb-3 text-sm font-semibold">Nova técnica</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-[var(--erp-fg-muted)]">
              Nome
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--erp-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[var(--erp-fg-muted)]">
              Empresa fornecedora
              <input
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--erp-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-[var(--erp-fg-muted)]">
              Tipo de cálculo
              <input
                value={newCalculationType}
                onChange={(e) => setNewCalculationType(e.target.value)}
                className="mt-1 w-full rounded border border-[var(--erp-border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex items-end gap-2 text-xs font-medium text-[var(--erp-fg-muted)]">
              <input
                type="checkbox"
                checked={newMultiplyColors}
                onChange={(e) => setNewMultiplyColors(e.target.checked)}
                className="rounded"
              />
              Multiplicar cores
            </label>
          </div>

          <TierEditor
            tiers={newTiers}
            onChange={setNewTiers}
            onAdd={() => setNewTiers((prev) => [...prev, { ...EMPTY_TIER }])}
            onRemove={(idx) =>
              setNewTiers((prev) =>
                prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx),
              )
            }
          />

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2AACE2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="rounded-lg border border-[var(--erp-border)] px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--erp-fg-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando gravações...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nenhuma técnica cadastrada"
            description="Importe a planilha Excel ou cadastre uma nova técnica manualmente."
          />
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <tr className="border-b border-[var(--erp-border)]">
                <th className="w-8 px-2 py-2" />
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Empresa</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Faixas</th>
                <th className="px-3 py-2 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                const draftsFromState = tierDrafts[row.id];
                // Se o estado estiver vazio por algum motivo, garantimos fallback nos dados da API.
                const drafts =
                  draftsFromState && draftsFromState.length
                    ? draftsFromState
                    : tiersToDraft(row.tiers);

                // TEMP: confirma se a API chegou no componente ao expandir.
                if (expanded) {
                  // eslint-disable-next-line no-console
                  console.log('[engraving] expanded row.tiers', row.id, row.tiers);
                }
                return (
                  <tr key={row.id} className="border-b border-[var(--erp-border)]/70 align-top">
                    <td colSpan={6} className="p-0">
                      <div>
                        <div className="flex items-center hover:bg-[var(--erp-bg-hover)]">
                          <button
                            type="button"
                            onClick={() => toggleExpand(row)}
                            className="px-2 py-3 text-[var(--erp-fg-muted)]"
                            aria-label={expanded ? 'Recolher' : 'Expandir'}
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpand(row)}
                            className="flex flex-1 items-center gap-0 text-left"
                          >
                            <span className="flex-1 px-1 py-3 font-medium text-[var(--erp-fg)]">
                              {row.name}
                            </span>
                            <span className="w-40 px-3 py-3 text-[var(--erp-fg-muted)]">
                              {row.supplierCompany || '—'}
                            </span>
                            <span className="w-28 px-3 py-3">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  row.active
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {row.active ? 'Ativo' : 'Inativo'}
                              </span>
                            </span>
                            <span className="w-20 px-3 py-3 tabular-nums">
                              {row.tierCount}
                            </span>
                          </button>
                          <div className="flex items-center gap-2 px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void handleToggleActive(row)}
                              disabled={togglingId === row.id}
                              className="rounded border border-[var(--erp-border)] px-2 py-1 text-xs font-medium hover:bg-[var(--erp-bg-hover)] disabled:opacity-50"
                            >
                              {togglingId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : row.active ? (
                                'Desativar'
                              ) : (
                                'Ativar'
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(row)}
                              className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="border-t border-[var(--erp-border)] bg-[var(--erp-bg)]/60 px-4 py-3">
                            <div className="mb-2 text-xs text-[var(--erp-fg-muted)]">
                              Cálculo: {row.calculationType}
                              {row.multiplyColors ? ' · Multiplica cores' : ''}
                            </div>
                            <EngravingTiersTable tiers={row.tiers} />
                            <TierEditor
                              tiers={drafts}
                              onChange={(next) =>
                                setTierDrafts((prev) => ({ ...prev, [row.id]: next }))
                              }
                              onAdd={() => addTierDraft(row.id)}
                              onRemove={(idx) => removeTierDraft(row.id, idx)}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveTiers(row)}
                              disabled={savingId === row.id}
                              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#2AACE2] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {savingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Salvar faixas
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TierEditor(props: {
  tiers: TierDraft[];
  onChange: (tiers: TierDraft[]) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  const { tiers, onChange, onAdd, onRemove } = props;

  const patch = (index: number, field: keyof TierDraft, value: string) => {
    const next = [...tiers];
    next[index] = { ...next[index]!, [field]: value };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-[var(--erp-fg-muted)]">
              <th className="px-2 py-1 text-left font-semibold">De</th>
              <th className="px-2 py-1 text-left font-semibold">Até</th>
              <th className="px-2 py-1 text-left font-semibold">Custo</th>
              <th className="px-2 py-1 text-left font-semibold">Tipo</th>
              <th className="px-2 py-1 text-left font-semibold">Taxa fixa</th>
              <th className="px-2 py-1 text-left font-semibold">Custo aplicação</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, index) => (
              <tr key={index}>
                <td className="px-2 py-1">
                  <input
                    value={tier.qtyFrom}
                    onChange={(e) => patch(index, 'qtyFrom', e.target.value)}
                    className="w-20 rounded border border-[var(--erp-border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={tier.qtyTo}
                    onChange={(e) => patch(index, 'qtyTo', e.target.value)}
                    className="w-20 rounded border border-[var(--erp-border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={tier.cost}
                    onChange={(e) => patch(index, 'cost', e.target.value)}
                    className="w-24 rounded border border-[var(--erp-border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={tier.costType}
                    onChange={(e) =>
                      patch(index, 'costType', e.target.value as TierDraft['costType'])
                    }
                    className="rounded border border-[var(--erp-border)] px-2 py-1"
                  >
                    <option value="Unidade">Unidade</option>
                    <option value="Intervalo">Intervalo</option>
                  </select>
                </td>
                <td className="px-2 py-1">
                  <input
                    value={tier.fixedFee}
                    onChange={(e) => patch(index, 'fixedFee', e.target.value)}
                    className="w-24 rounded border border-[var(--erp-border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <input
                    value={tier.applicationCost}
                    onChange={(e) => patch(index, 'applicationCost', e.target.value)}
                    className="w-24 rounded border border-[var(--erp-border)] px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="rounded p-1 text-rose-600 hover:bg-rose-50"
                    aria-label="Remover faixa"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="text-xs font-semibold text-[#2AACE2] hover:underline"
      >
        + Adicionar faixa
      </button>
      <p className="text-[11px] text-[var(--erp-fg-muted)]">
        Ex.: custo {formatQuoteCurrency('1.25')} por unidade no intervalo informado.
      </p>
    </div>
  );
}

function EngravingTiersTable(props: { tiers: EngravingPriceTierDto[] | undefined | null }) {
  const tiers = props.tiers ?? [];

  return (
    <div className="mb-3 overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead>
          <tr className="text-[var(--erp-fg-muted)]">
            <th className="px-2 py-1 text-left font-semibold">De</th>
            <th className="px-2 py-1 text-left font-semibold">Até</th>
            <th className="px-2 py-1 text-left font-semibold">Custo</th>
            <th className="px-2 py-1 text-left font-semibold">Tipo</th>
            <th className="px-2 py-1 text-left font-semibold">Taxa Fixa</th>
            <th className="px-2 py-1 text-left font-semibold">Custo Aplicação</th>
          </tr>
        </thead>
        <tbody>
          {tiers.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2 py-2 text-[var(--erp-fg-muted)]">
                —
              </td>
            </tr>
          ) : (
            tiers.map((tier) => (
              <tr key={tier.id ?? `${tier.qtyFrom}-${tier.qtyTo}-${tier.cost}`} className="border-b border-[var(--erp-border)]/60">
                <td className="px-2 py-1 tabular-nums">{tier.qtyFrom}</td>
                <td className="px-2 py-1 tabular-nums">{tier.qtyTo}</td>
                <td className="px-2 py-1">{formatQuoteCurrency(tier.cost)}</td>
                <td className="px-2 py-1">{tier.costType}</td>
                <td className="px-2 py-1">{formatOptionalCurrencyDash(tier.fixedFee)}</td>
                <td className="px-2 py-1">{formatOptionalCurrencyDash(tier.applicationCost)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
