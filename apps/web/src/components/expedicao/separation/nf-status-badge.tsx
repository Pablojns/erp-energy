'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ListOrdered, Loader2, XCircle } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type NfJobStatus = 'aguardando' | 'processando' | 'concluido' | 'erro';

type NfJob = {
  id: string;
  numeroPed: string;
  status: NfJobStatus;
  numeroNota?: string;
  erro?: string;
  criadoEm: string;
  concluidoEm?: string;
};

const NOTIFIED_JOBS_KEY = 'nfQueue:notifiedJobs';

function readNotifiedJobs(): Record<string, true> {
  try {
    const raw = localStorage.getItem(NOTIFIED_JOBS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, true>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotifiedJobs(data: Record<string, true>) {
  localStorage.setItem(NOTIFIED_JOBS_KEY, JSON.stringify(data));
}

export function NfStatusBadge(props: {
  onToast: (v: { variant: 'ok' | 'err'; message: string }) => void;
  onRefetch: () => void | Promise<void>;
}) {
  const { onToast, onRefetch } = props;
  const [jobs, setJobs] = useState<NfJob[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let ativo = true;

    const pollFila = async () => {
      try {
        const lista = await erpFetchJson<NfJob[]>('pedidos/nf-fila');
        if (!ativo) return;

        const ordenados = [...lista].sort(
          (a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime(),
        );
        setJobs(ordenados);

        const notificados = readNotifiedJobs();
        let atualizouNotificados = false;
        let precisaRefetch = false;

        for (const job of ordenados) {
          if (notificados[job.id]) continue;
          if (job.status !== 'concluido' && job.status !== 'erro') continue;

          if (job.status === 'concluido') {
            const finalizado = await erpFetchJson<NfJob>(`pedidos/nf-fila/${job.id}`).catch(
              () => job,
            );
            const nota = finalizado.numeroNota ? `#${finalizado.numeroNota}` : '(sem número)';
            onToast({
              variant: 'ok',
              message: `NF-e ${nota} gerada para pedido #${finalizado.numeroPed} ✓`,
            });
            precisaRefetch = true;
          } else {
            onToast({
              variant: 'err',
              message: `Erro ao emitir NF do pedido #${job.numeroPed}`,
            });
          }

          notificados[job.id] = true;
          atualizouNotificados = true;
        }

        if (atualizouNotificados) saveNotifiedJobs(notificados);
        if (precisaRefetch) void onRefetch();
      } catch {
        // mantém silencioso para não poluir o usuário com erro de polling
      }
    };

    void pollFila();
    const id = window.setInterval(() => {
      void pollFila();
    }, 15000);

    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [onRefetch, onToast]);

  const pendentes = useMemo(
    () => jobs.filter((job) => job.status === 'aguardando' || job.status === 'processando').length,
    [jobs],
  );

  const aguardandoPosicao = useMemo(() => {
    const aguardando = jobs
      .filter((job) => job.status === 'aguardando')
      .sort((a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime());
    const mapa: Record<string, number> = {};
    aguardando.forEach((job, idx) => {
      mapa[job.id] = idx + 1;
    });
    return mapa;
  }, [jobs]);

  return (
    <div className="relative">
      <button
        type="button"
        className="erp-filter-chip-btn min-h-[44px]"
        onClick={() => setOpen((v) => !v)}
      >
        <ListOrdered className="h-4 w-4" />
        Fila NF
        <span className="rounded-md bg-[var(--erp-accent)] px-2 py-0.5 text-xs font-semibold text-white">
          {pendentes}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-[220] mt-2 w-[360px] rounded-xl border border-erp-border bg-erp-surface p-3 shadow-xl">
          <p className="mb-2 text-sm font-semibold text-erp-fg">Fila de emissão (24h)</p>
          <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
            {jobs.length === 0 ? (
              <p className="text-xs text-erp-fg-muted">Nenhum job recente.</p>
            ) : (
              jobs.map((job) => {
                const hora = new Date(job.concluidoEm ?? job.criadoEm).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                if (job.status === 'processando') {
                  return (
                    <div key={job.id} className="rounded-lg border border-erp-border p-2 text-xs text-erp-fg">
                      <p className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--erp-accent)]" />
                        #{job.numeroPed} Processando...
                      </p>
                    </div>
                  );
                }

                if (job.status === 'aguardando') {
                  return (
                    <div key={job.id} className="rounded-lg border border-erp-border p-2 text-xs text-erp-fg">
                      <p className="flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-amber-400" />
                        #{job.numeroPed} Na fila ({aguardandoPosicao[job.id] ?? 1}a posição)
                      </p>
                    </div>
                  );
                }

                if (job.status === 'concluido') {
                  return (
                    <div key={job.id} className="rounded-lg border border-erp-border p-2 text-xs text-erp-fg">
                      <p className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        #{job.numeroPed} NF #{job.numeroNota ?? '?'} — concluído às {hora}
                      </p>
                    </div>
                  );
                }

                return (
                  <div key={job.id} className="rounded-lg border border-erp-border p-2 text-xs text-erp-fg">
                    <p className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      #{job.numeroPed} Erro — {job.erro || 'clique para ver'}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
