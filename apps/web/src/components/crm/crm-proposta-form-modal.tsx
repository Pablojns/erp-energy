'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  calcPropostaGrandTotal,
  calcPropostaItemTotal,
  createCrmProposta,
  formatCrmCurrency,
  updateCrmProposta,
  type CrmPropostaDto,
  type CrmPropostaItemInput,
} from '@/src/services/api/crm-api';

function emptyItem(): CrmPropostaItemInput {
  return { descricao: '', quantidade: 1, valorUnit: 0, desconto: 0 };
}

const inputClass =
  'w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] outline-none';

const labelClass =
  'block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]';

export function CrmPropostaFormModal(props: {
  open: boolean;
  cardId: string;
  proposta?: CrmPropostaDto | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { open, cardId, proposta, onClose, onSaved } = props;
  const isEdit = Boolean(proposta);
  const [mounted, setMounted] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [validade, setValidade] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [descontoGeral, setDescontoGeral] = useState('0');
  const [itens, setItens] = useState<CrmPropostaItemInput[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (proposta) {
      setTitulo(proposta.titulo);
      setValidade(proposta.validade ? proposta.validade.slice(0, 10) : '');
      setObservacoes(proposta.observacoes ?? '');
      setDescontoGeral(proposta.desconto ?? '0');
      setItens(
        proposta.itens.map((item) => ({
          descricao: item.descricao,
          quantidade: item.quantidade,
          valorUnit: Number(item.valorUnit),
          desconto: Number(item.desconto),
        })),
      );
    } else {
      setTitulo('');
      setValidade('');
      setObservacoes('');
      setDescontoGeral('0');
      setItens([emptyItem()]);
    }
    setError(null);
  }, [open, proposta]);

  const descontoPct = Number(descontoGeral.replace(',', '.')) || 0;
  const totals = useMemo(
    () => calcPropostaGrandTotal(itens, descontoPct),
    [descontoPct, itens],
  );

  if (!open || !mounted) return null;

  const updateItem = (index: number, patch: Partial<CrmPropostaItemInput>) => {
    setItens((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const handleSave = async () => {
    const title = titulo.trim();
    if (!title) {
      setError('Informe o título da proposta.');
      return;
    }
    const validItens = itens.filter((item) => item.descricao.trim());
    if (validItens.length === 0) {
      setError('Adicione ao menos um item com descrição.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        titulo: title,
        validade: validade || undefined,
        observacoes: observacoes.trim() || undefined,
        desconto: descontoPct,
        itens: validItens.map((item) => ({
          descricao: item.descricao.trim(),
          quantidade: Math.max(1, item.quantidade),
          valorUnit: Math.max(0, item.valorUnit),
          desconto: Math.min(100, Math.max(0, item.desconto)),
        })),
      };
      if (isEdit && proposta) {
        await updateCrmProposta(proposta.id, payload);
      } else {
        await createCrmProposta(cardId, payload);
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar proposta.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="flex max-h-[90vh] min-h-0 flex-col overflow-hidden border-white/[0.12] shadow-2xl">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              {isEdit ? 'Editar Proposta' : 'Nova Proposta'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[37fr_63fr] lg:gap-6">
              {/* Coluna esquerda — campos gerais */}
              <div className="flex flex-col gap-4">
                <label className={labelClass}>
                  Título da proposta
                  <input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex.: Proposta comercial — kits solares"
                    className={`mt-1.5 ${inputClass}`}
                  />
                </label>

                <label className={labelClass}>
                  Validade
                  <input
                    type="date"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                    className={`mt-1.5 ${inputClass}`}
                  />
                </label>

                <label className={labelClass}>
                  Desconto geral (%)
                  <input
                    value={descontoGeral}
                    onChange={(e) => setDescontoGeral(e.target.value)}
                    className={`mt-1.5 ${inputClass}`}
                  />
                </label>

                <label className={`${labelClass} flex min-h-[7rem] flex-1 flex-col`}>
                  Observações
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={4}
                    className={`mt-1.5 min-h-[6rem] flex-1 resize-y ${inputClass}`}
                  />
                </label>

                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-3 text-sm">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span>{formatCrmCurrency(totals.subtotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-[var(--text-secondary)]">
                    <span>Desconto geral ({descontoPct}%)</span>
                    <span>-{formatCrmCurrency(totals.subtotal - totals.total)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-[var(--border-color)] pt-2 text-base font-bold text-[var(--text-primary)]">
                    <span>Total</span>
                    <span>{formatCrmCurrency(totals.total)}</span>
                  </div>
                </div>

                {error ? <p className="text-sm text-rose-400">{error}</p> : null}
              </div>

              {/* Coluna direita — tabela de itens */}
              <div className="flex min-h-[16rem] min-w-0 flex-col lg:min-h-0">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                    Itens
                  </h3>
                  <button
                    type="button"
                    onClick={() => setItens((rows) => [...rows, emptyItem()])}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--input-bg)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar linha
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto rounded-xl border border-[var(--border-color)]">
                  <table className="w-full table-fixed text-sm">
                    <colgroup>
                      <col style={{ width: '52%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '4%' }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-[var(--input-bg)]">
                      <tr className="border-b border-[var(--border-color)] text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                        <th className="min-w-[20ch] px-2 py-2.5 sm:px-3">Descrição</th>
                        <th className="w-16 px-1 py-2.5">Qtd</th>
                        <th className="w-24 px-1 py-2.5">Valor unit.</th>
                        <th className="w-16 px-1 py-2.5">Desc. %</th>
                        <th className="w-24 px-1 py-2.5">Total</th>
                        <th className="w-10 px-1 py-2.5" aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, index) => (
                        <tr
                          key={index}
                          className="border-b border-[var(--border-color)] last:border-0"
                        >
                          <td className="min-w-[20ch] px-2 py-2 align-top sm:px-3">
                            <input
                              value={item.descricao}
                              onChange={(e) =>
                                updateItem(index, { descricao: e.target.value })
                              }
                              className={`min-w-[20ch] w-full ${inputClass}`}
                            />
                          </td>
                          <td className="w-16 px-1 py-2 align-top">
                            <input
                              type="number"
                              min={1}
                              value={item.quantidade}
                              onChange={(e) =>
                                updateItem(index, {
                                  quantidade: Number(e.target.value) || 1,
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="w-24 px-1 py-2 align-top">
                            <input
                              value={item.valorUnit || ''}
                              onChange={(e) =>
                                updateItem(index, {
                                  valorUnit:
                                    Number(e.target.value.replace(',', '.')) || 0,
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="w-16 px-1 py-2 align-top">
                            <input
                              value={item.desconto || ''}
                              onChange={(e) =>
                                updateItem(index, {
                                  desconto:
                                    Number(e.target.value.replace(',', '.')) || 0,
                                })
                              }
                              className={inputClass}
                            />
                          </td>
                          <td className="w-24 px-1 py-2 align-top">
                            <p className="whitespace-nowrap py-2 text-xs font-bold text-[var(--text-primary)] sm:text-sm">
                              {formatCrmCurrency(calcPropostaItemTotal(item))}
                            </p>
                          </td>
                          <td className="w-10 px-1 py-2 align-top">
                            {itens.length > 1 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setItens((rows) => rows.filter((_, i) => i !== index))
                                }
                                className="rounded-lg p-1.5 text-rose-300 hover:bg-rose-500/10"
                                aria-label="Remover item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3 sm:px-5 sm:py-4">
            <GlowButton variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </GlowButton>
            <GlowButton variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
            </GlowButton>
          </footer>
        </GlassCard>
      </div>
    </div>,
    document.body,
  );
}
