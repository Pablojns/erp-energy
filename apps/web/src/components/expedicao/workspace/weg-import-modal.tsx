'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { generateUUID } from '@/src/lib/uuid';
import { clientLogger } from '@/src/services/observability/client-logger';

type WegImportSummary = {
  importados: number;
  atualizados: number;
  ignorados: number;
  erros: string[];
  resetados?: number;
};

function nestErrorMessage(payload: unknown, fallbackStatus: number): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('message' in payload) ||
    payload.message === undefined
  ) {
    return `Erro HTTP ${fallbackStatus}`;
  }
  const raw = payload.message;
  if (Array.isArray(raw)) {
    return raw.map((part) => String(part)).join(' · ');
  }
  return String(raw);
}

async function postWegImport(file: File): Promise<WegImportSummary> {
  const formData = new FormData();
  formData.append('file', file);
  const requestId = generateUUID();

  const res = await fetch('/api/erp/pedidos/importar', {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-request-id': requestId },
    body: formData,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }

  if (!res.ok) {
    clientLogger.error('WEG import request failed', {
      action: 'expedicao.weg_import.error',
      requestId,
      statusCode: res.status,
      responseBody: body,
    });
    throw new Error(nestErrorMessage(body, res.status));
  }

  return body as WegImportSummary;
}

function ImportSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Importando planilha">
      <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
      <div className="h-4 w-full animate-pulse rounded bg-white/10" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
      <div className="mt-4 h-20 w-full animate-pulse rounded-lg bg-white/10" />
      <p className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Processando planilha…
      </p>
    </div>
  );
}

export function WegImportModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}) {
  const { isOpen, onClose, onImported } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WegImportSummary | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setUploading(false);
    setError(null);
    setSummary(null);
  }, [isOpen]);

  const handleClose = () => {
    if (uploading) return;
    onClose();
  };

  const handleFileChange = (next: File | null) => {
    if (!next) {
      setFile(null);
      return;
    }
    const name = next.name.toLowerCase();
    if (!name.endsWith('.xlsx')) {
      setError('Selecione um arquivo .xlsx.');
      setFile(null);
      return;
    }
    setError(null);
    setSummary(null);
    setFile(next);
  };

  const handleImport = async () => {
    if (!file) {
      setError('Selecione um arquivo .xlsx para importar.');
      return;
    }

    setUploading(true);
    setError(null);
    setSummary(null);
    try {
      const result = await postWegImport(file);
      setSummary(result);
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao importar planilha.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  const pedidosOk = (summary?.importados ?? 0) + (summary?.atualizados ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--color-overlay)]"
        aria-label="Fechar"
        onClick={handleClose}
        disabled={uploading}
      />

      <div
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl"
        role="dialog"
        aria-labelledby="weg-import-title"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <h2
            id="weg-import-title"
            className="flex items-center gap-2 text-lg font-semibold text-[var(--text-primary)]"
          >
            <FileSpreadsheet className="h-5 w-5 text-[var(--accent)]" />
            Importar WEG
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="rounded-md p-1 text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {uploading ? (
            <ImportSkeleton />
          ) : (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Envie a planilha exportada do Mercado Eletrônico WEG (.xlsx).
              </p>

              <div>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--input-bg)]/50 px-4 py-8 text-sm text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                >
                  <Upload className="h-5 w-5" />
                  {file ? file.name : 'Selecionar arquivo .xlsx'}
                </button>
              </div>

              {summary ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                  <p className="font-medium">
                    {pedidosOk} pedidos importados, {summary.ignorados} ignorados,{' '}
                    {summary.erros.length} erros
                  </p>
                  {summary.erros.length > 0 ? (
                    <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-4 text-xs text-emerald-100/90">
                      {summary.erros.slice(0, 8).map((msg) => (
                        <li key={msg}>{msg}</li>
                      ))}
                      {summary.erros.length > 8 ? (
                        <li>+{summary.erros.length - 8} outros erros</li>
                      ) : null}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-[var(--border-color)] px-5 py-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 rounded-lg border border-[var(--border-color)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)] disabled:opacity-50"
          >
            {summary ? 'Fechar' : 'Cancelar'}
          </button>
          {!summary ? (
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={uploading || !file}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Importar
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
