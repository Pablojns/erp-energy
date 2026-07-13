'use client';

import { useMemo, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import {
  normalizeCrmImportOrigin,
  parseCrmImportCsv,
} from '@/src/components/crm/crm-helpers';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  CRM_ORIGIN_LABEL,
  importCrmLeads,
  type CrmCardOrigin,
  type CrmImportLeadInput,
} from '@/src/services/api/crm-api';

type PreviewRow = CrmImportLeadInput & {
  rowNumber: number;
  error?: string;
};

export function CrmImportModal(props: {
  open: boolean;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const { open, onClose, onImported } = props;
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    const rows = parseCrmImportCsv(csvText);
    return rows.map((row, index): PreviewRow => {
      const rowNumber = index + 2;
      if (!row.nome.trim()) {
        return {
          rowNumber,
          nome: row.nome,
          origem: 'FRIO',
          error: 'Nome obrigatório',
        };
      }
      const origem = normalizeCrmImportOrigin(row.origem) ?? 'FRIO';
      const parsedValue = row.valor.trim()
        ? Number(row.valor.replace(',', '.'))
        : null;
      if (row.valor.trim() && !Number.isFinite(parsedValue)) {
        return {
          rowNumber,
          nome: row.nome.trim(),
          telefone: row.telefone || null,
          email: row.email || null,
          origem,
          error: 'Valor inválido',
        };
      }
      return {
        rowNumber,
        nome: row.nome.trim(),
        telefone: row.telefone || null,
        email: row.email || null,
        origem,
        valor: parsedValue,
        observacoes: row.observacoes || null,
      };
    });
  }, [csvText]);

  const validRows = preview.filter((row) => !row.error);

  if (!open) return null;

  const handleFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setError(null);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await importCrmLeads(
        validRows.map(({ nome, telefone, email, origem, valor, observacoes }) => ({
          nome,
          telefone,
          email,
          origem,
          valor,
          observacoes,
        })),
      );
      setCsvText('');
      await onImported();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao importar leads.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="h-auto max-h-[92vh] w-full max-w-4xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <GlassCard className="border-gray-200 p-4 shadow-2xl sm:p-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Importar leads (CSV)
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Colunas: nome, telefone, email, origem, valor, observações
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)]"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md inline-flex cursor-pointer">
            <Upload className="erp-icon-sm" aria-hidden />
            Selecionar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>

          {preview.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--input-bg)] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">Nome</th>
                    <th className="px-2 py-2 text-left">Telefone</th>
                    <th className="px-2 py-2 text-left">E-mail</th>
                    <th className="px-2 py-2 text-left">Origem</th>
                    <th className="px-2 py-2 text-left">Valor</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.rowNumber} className="border-t border-[var(--border-color)]">
                      <td className="px-2 py-2">{row.rowNumber}</td>
                      <td className="px-2 py-2">{row.nome}</td>
                      <td className="px-2 py-2">{row.telefone ?? '—'}</td>
                      <td className="px-2 py-2">{row.email ?? '—'}</td>
                      <td className="px-2 py-2">
                        {CRM_ORIGIN_LABEL[row.origem as CrmCardOrigin]}
                      </td>
                      <td className="px-2 py-2">{row.valor ?? '—'}</td>
                      <td className="px-2 py-2">
                        {row.error ? (
                          <span className="text-rose-400">{row.error}</span>
                        ) : (
                          <span className="text-emerald-700">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              {validRows.length} de {preview.length} linha(s) válida(s)
            </p>
            <div className="flex gap-2">
              <GlowButton variant="secondary" onClick={onClose} disabled={importing}>
                Cancelar
              </GlowButton>
              <GlowButton
                variant="primary"
                disabled={importing || validRows.length === 0}
                onClick={() => void handleImport()}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  `Importar ${validRows.length} lead(s)`
                )}
              </GlowButton>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
