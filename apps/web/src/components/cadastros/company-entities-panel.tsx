'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Pencil, Power, X } from 'lucide-react';
import { formatCpfCnpj } from '@/src/components/cadastros/document-mask';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type CompanyEntityDto = {
  id: string;
  name: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  endereco: string | null;
  isMatriz: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  name: string;
  cnpj: string;
  inscricaoEstadual: string;
  endereco: string;
  isMatriz: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  cnpj: '',
  inscricaoEstadual: '',
  endereco: '',
  isMatriz: false,
});

function fieldClass() {
  return 'erp-module-input';
}

export function CompanyEntitiesPanel() {
  const [rows, setRows] = useState<CompanyEntityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CompanyEntityDto | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await erpFetchJson<CompanyEntityDto[]>(
        'cadastros/company-entities',
      );
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'Falha ao carregar empresas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (row: CompanyEntityDto) => {
    setEditing(row);
    setForm({
      name: row.name,
      cnpj: formatCpfCnpj(row.cnpj),
      inscricaoEstadual: row.inscricaoEstadual ?? '',
      endereco: row.endereco ?? '',
      isMatriz: row.isMatriz,
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.name.trim() || !form.cnpj.trim()) {
      setError('Nome e CNPJ são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await erpFetchJson(`cadastros/company-entities/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          cnpj: form.cnpj,
          inscricaoEstadual: form.inscricaoEstadual.trim() || null,
          endereco: form.endereco.trim() || null,
          isMatriz: form.isMatriz,
        }),
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar empresa.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (row: CompanyEntityDto) => {
    setTogglingId(row.id);
    setError(null);
    try {
      await erpFetchJson(`cadastros/company-entities/${row.id}/toggle`, {
        method: 'PATCH',
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao alterar status.');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Empresas (CNPJ)
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Matriz e filiais usadas na emissão de notas e no estoque físico.
          </p>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
        {loading ? (
          <p className="p-6 text-center text-sm text-[var(--text-muted)]">
            Carregando…
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-muted)]">
            Nenhuma empresa cadastrada.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">CNPJ</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[var(--border-color)]"
                >
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                    {row.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                    {formatCpfCnpj(row.cnpj)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.isMatriz ? (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
                        Matriz
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        Filial
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.isActive ? (
                      <span className="text-emerald-700">Ativo</span>
                    ) : (
                      <span className="text-rose-600">Inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => openEdit(row)}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title={row.isActive ? 'Desativar' : 'Ativar'}
                        disabled={togglingId === row.id}
                        onClick={() => void handleToggle(row)}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--input-bg)] disabled:opacity-50"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Fechar"
            onClick={() => setEditing(null)}
            disabled={saving}
          />
          <div className="erp-modal-panel relative w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Building2 className="h-5 w-5" />
                Editar empresa
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-xs font-medium text-gray-600">
                Nome
                <input
                  className={`${fieldClass()} mt-1`}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                CNPJ
                <input
                  className={`${fieldClass()} mt-1`}
                  value={form.cnpj}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      cnpj: formatCpfCnpj(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Inscrição estadual
                <input
                  className={`${fieldClass()} mt-1`}
                  value={form.inscricaoEstadual}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      inscricaoEstadual: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                Endereço (JSON ou texto)
                <textarea
                  className={`${fieldClass()} mt-1 min-h-[72px]`}
                  value={form.endereco}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endereco: e.target.value }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isMatriz}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isMatriz: e.target.checked }))
                  }
                />
                Matriz (vendas / padrão Site)
              </label>
            </div>
            <div className="flex gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
              <button
                type="button"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="flex-1 erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
