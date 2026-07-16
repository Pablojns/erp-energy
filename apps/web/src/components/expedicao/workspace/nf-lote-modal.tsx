'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

export type NfLoteItemStatus =
  | 'aguardando'
  | 'processando'
  | 'concluido'
  | 'erro';

export type NfLoteJobState = {
  jobId: string;
  status: 'processando' | 'concluido';
  items: Array<{
    numeroPed: string;
    status: NfLoteItemStatus;
    logs: string[];
    numeroNF?: string;
    erro?: string;
  }>;
  processedCount: number;
  successCount: number;
  errorCount: number;
  total: number;
};

function statusIcon(status: NfLoteItemStatus): string {
  switch (status) {
    case 'aguardando':
      return '⏳';
    case 'processando':
      return '🔄';
    case 'concluido':
      return '✅';
    case 'erro':
      return '❌';
  }
}

function statusLabel(status: NfLoteItemStatus): string {
  switch (status) {
    case 'aguardando':
      return 'Aguardando';
    case 'processando':
      return 'Processando';
    case 'concluido':
      return 'Concluído';
    case 'erro':
      return 'Erro';
  }
}

export function NfLoteModal(props: {
  numeroPeds: string[];
  onClose: () => void;
  onFinished?: () => void;
}) {
  const { numeroPeds, onClose, onFinished } = props;
  const [job, setJob] = useState<NfLoteJobState | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const startedRef = useRef(false);
  const finishedNotifiedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const started = await erpFetchJson<NfLoteJobState>('pedidos/gerar-nf-lote', {
          method: 'POST',
          body: JSON.stringify({ numeroPeds }),
        });
        setJob(started);
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : 'Falha ao iniciar emissão em lote.',
        );
      }
    })();
  }, [numeroPeds]);

  useEffect(() => {
    if (!job || job.status === 'concluido') return;

    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const next = await erpFetchJson<NfLoteJobState>(
            `pedidos/nf-lote-status/${job.jobId}`,
          );
          setJob(next);
        } catch {
          /* polling silencioso — tenta de novo no próximo tick */
        }
      })();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  useEffect(() => {
    if (job?.status === 'concluido' && !finishedNotifiedRef.current) {
      finishedNotifiedRef.current = true;
      onFinished?.();
    }
  }, [job?.status, onFinished]);

  const activeLogs = useMemo(() => {
    if (!job) return [] as string[];
    const processing = job.items.find((i) => i.status === 'processando');
    const lastDone = [...job.items]
      .reverse()
      .find((i) => i.status === 'concluido' || i.status === 'erro');
    const focus = processing ?? lastDone;
    if (!focus) return [];
    return focus.logs.map((line) => `[#${focus.numeroPed}] ${line}`);
  }, [job]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeLogs]);

  const progressLabel = job
    ? job.status === 'concluido'
      ? `Finalizado: ${job.successCount} de ${job.total} concluídos com sucesso${
          job.errorCount > 0 ? `, ${job.errorCount} erro${job.errorCount > 1 ? 's' : ''}` : ''
        }`
      : `Processando ${Math.min(job.processedCount + 1, job.total)} de ${job.total}…`
    : 'Iniciando lote…';

  const progressPct = job
    ? Math.round((job.processedCount / Math.max(job.total, 1)) * 100)
    : 0;

  const errorItems = job?.items.filter((i) => i.status === 'erro') ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4">
      <div
        className="flex w-full max-w-xl flex-col rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        style={{ maxHeight: '92vh' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
              <FileText className="h-4 w-4" aria-hidden />
              Gerar NF em Lote
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{progressLabel}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--input-bg)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {startError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {startError}
          </p>
        ) : null}

        <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-color)]">
          <ul className="divide-y divide-[var(--border-color)]">
            {(job?.items ?? numeroPeds.map((numeroPed) => ({
              numeroPed,
              status: 'aguardando' as const,
              logs: [] as string[],
            }))).map((item) => (
              <li
                key={item.numeroPed}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-[var(--text-primary)]">
                  #{item.numeroPed}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <span aria-hidden>{statusIcon(item.status)}</span>
                  {statusLabel(item.status)}
                  {item.status === 'processando' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {'numeroNF' in item && item.numeroNF ? (
                    <span className="font-mono text-emerald-600">NF {item.numeroNF}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3 min-h-[8rem] flex-1 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
            Log da automação
          </p>
          {activeLogs.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              {(job?.status ?? 'processando') === 'processando' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Aguardando mensagens do robô…
            </div>
          ) : (
            <ul className="space-y-1.5 font-mono text-xs text-[var(--text-primary)]">
              {activeLogs.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
              <div ref={logEndRef} />
            </ul>
          )}
        </div>

        {job?.status === 'concluido' && errorItems.length > 0 ? (
          <div className="mt-3">
            <button
              type="button"
              className="text-sm font-semibold text-rose-600 underline-offset-2 hover:underline"
              onClick={() => setShowErrorDetails((v) => !v)}
            >
              {showErrorDetails ? 'Ocultar detalhes do erro' : 'Ver detalhes do erro'}
            </button>
            {showErrorDetails ? (
              <ul className="mt-2 space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {errorItems.map((item) => (
                  <li key={item.numeroPed}>
                    <strong>#{item.numeroPed}:</strong> {item.erro ?? 'Erro desconhecido'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
