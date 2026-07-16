'use client';

import { useEffect, useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type WegImportLogEntry = {
  id: string;
  createdAt: string;
  importedAt: string | null;
  trigger: 'MANUAL' | 'AUTOMATIC' | 'SCHEDULED';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  fileName: string | null;
  importados: number;
  atualizados: number;
  ignorados: number;
  pedidosProcessados: number;
  errosCount: number;
  erros: string[];
  errorMessage: string | null;
};

type ImportLogResponse = {
  items: WegImportLogEntry[];
};

const TRIGGER_LABEL: Record<WegImportLogEntry['trigger'], string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automática',
  SCHEDULED: 'Agendada',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(entry: WegImportLogEntry): { text: string; tone: 'ok' | 'error' | 'pending' } {
  if (entry.status === 'FAILED') {
    return { text: 'Erro', tone: 'error' };
  }
  if (entry.status === 'COMPLETED') {
    return entry.errosCount > 0
      ? { text: 'Sucesso com avisos', tone: 'ok' }
      : { text: 'Sucesso', tone: 'ok' };
  }
  return { text: 'Em andamento', tone: 'pending' };
}

export function WegImportStatusPanel() {
  const [last, setLast] = useState<WegImportLogEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    erpFetchJson<ImportLogResponse>('pedidos/importacoes-log?limit=1')
      .then((res) => {
        if (!cancelled) setLast(res.items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLast(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <article className="exec-card flex items-center gap-3 p-3 text-sm text-[var(--dash-text-muted)]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Carregando última importação WEG…
      </article>
    );
  }

  if (!last) {
    return (
      <article className="exec-card p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--dash-text)]">
          <FileSpreadsheet className="h-4 w-4 text-[var(--dash-accent)]" aria-hidden />
          Última importação WEG
        </div>
        <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
          Nenhuma importação registrada ainda.
        </p>
      </article>
    );
  }

  const when = formatDateTime(last.importedAt ?? last.createdAt);
  const status = statusLabel(last);

  return (
    <article className="exec-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--dash-text)]">
            <FileSpreadsheet className="h-4 w-4 shrink-0 text-[var(--dash-accent)]" aria-hidden />
            Última importação WEG
          </div>
          <p className="mt-1 text-xs text-[var(--dash-text-muted)]">
            {when} · {TRIGGER_LABEL[last.trigger]}
            {last.fileName ? ` · ${last.fileName}` : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            status.tone === 'error'
              ? 'bg-rose-100 text-rose-700'
              : status.tone === 'pending'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {status.text}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-[var(--dash-text-muted)]">Pedidos processados</dt>
          <dd className="font-semibold tabular-nums text-[var(--dash-text)]">
            {last.pedidosProcessados}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dash-text-muted)]">Novos</dt>
          <dd className="font-semibold tabular-nums text-[var(--dash-text)]">
            {last.importados}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dash-text-muted)]">Atualizados</dt>
          <dd className="font-semibold tabular-nums text-[var(--dash-text)]">
            {last.atualizados}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--dash-text-muted)]">Erros</dt>
          <dd className="font-semibold tabular-nums text-[var(--dash-text)]">
            {last.errosCount}
          </dd>
        </div>
      </dl>

      {last.status === 'FAILED' && last.errorMessage ? (
        <p className="mt-2 text-xs text-rose-600">{last.errorMessage}</p>
      ) : null}
    </article>
  );
}
