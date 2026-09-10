'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ATRASO_CSV_HEADERS,
  FinanceiroAtrasoTab,
  contasAtrasoToCsvRows,
} from '@/src/components/financeiro/atraso-tab';
import { FinanceiroDashboardTab } from '@/src/components/financeiro/dashboard-tab';
import {
  DESPESAS_CSV_HEADERS,
  FinanceiroDespesasTab,
  despesasToCsvRows,
} from '@/src/components/financeiro/despesas-tab';
import {
  EXTRATO_CSV_HEADERS,
  FinanceiroExtratoTab,
  extratoToCsvRows,
} from '@/src/components/financeiro/extrato-tab';
import { FinanceiroHeader } from '@/src/components/financeiro/financeiro-header';
import {
  NFS_CSV_HEADERS,
  FinanceiroNfsTab,
  nfsToCsvRows,
} from '@/src/components/financeiro/nfs-tab';
import type {
  Despesa,
  ExtratoResponse,
  FinanceiroDashboard,
  FinanceiroPeriodPreset,
  FinanceiroTab,
  ContasAtrasoResponse,
} from '@/src/components/financeiro/types';
import {
  buildFinanceiroPeriodQuery,
  defaultMonthRange,
  downloadCsv,
  fetchAllNfsEmAberto,
  filterNfsByPeriod,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import {
  adjustRangeOnDateChange,
  normalizeDateRange,
} from '@/src/lib/period-range';
import '@/src/components/financeiro/financeiro.css';

type CaSyncJob = {
  jobId: string;
  status: 'processando' | 'concluido' | 'erro';
  processedWindows: number;
  totalWindows: number;
  message: string;
  error?: string;
};

async function pollCaSync(onProgress: (message: string) => void): Promise<CaSyncJob> {
  const started = await erpFetchJson<CaSyncJob>('api/financeiro/conta-azul/sync', {
    method: 'POST',
  });
  onProgress(started.message);
  let current = started;
  while (current.status === 'processando') {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    current = await erpFetchJson<CaSyncJob>(
      `api/financeiro/conta-azul/sync-status/${started.jobId}`,
    );
    onProgress(current.message);
  }
  if (current.status === 'erro') {
    throw new Error(
      current.error || current.message || 'Falha na sincronização da Conta Azul.',
    );
  }
  return current;
}

export function FinanceiroWorkspace() {
  const defaultRange = useMemo(() => defaultMonthRange(), []);
  const { hasPermission } = useNavPermissions();
  const canEditCa = hasPermission('financeiro', 'editar');
  const [tab, setTab] = useState<FinanceiroTab>('dashboard');
  const [periodPreset, setPeriodPreset] = useState<FinanceiroPeriodPreset>('mes');
  const [dataInicio, setDataInicio] = useState(defaultRange.dataInicio);
  const [dataFim, setDataFim] = useState(defaultRange.dataFim);
  const [syncing, setSyncing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [nfsCount, setNfsCount] = useState(0);
  const [atrasoCount, setAtrasoCount] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [caConnected, setCaConnected] = useState(false);
  const [caLastSync, setCaLastSync] = useState<string | null>(null);
  const [caBusy, setCaBusy] = useState(false);
  const [caSyncProgress, setCaSyncProgress] = useState<string | null>(null);
  const [caCodeOpen, setCaCodeOpen] = useState(false);
  const [caCode, setCaCode] = useState('');
  const [caState, setCaState] = useState('');

  const period = useMemo(
    () => normalizeDateRange({ dataInicio, dataFim }),
    [dataInicio, dataFim],
  );

  useEffect(() => {
    void fetchAllNfsEmAberto()
      .then((nfs) => setNfsCount(nfs.length))
      .catch(() => setNfsCount(0));
    void erpFetchJson<ContasAtrasoResponse>('api/financeiro/contas-atraso')
      .then((res) => setAtrasoCount(res.totalTitulos))
      .catch(() => setAtrasoCount(0));
    void erpFetchJson<{
      connected: boolean;
      lastSyncAt: string | null;
    }>('api/financeiro/conta-azul/status')
      .then((s) => {
        setCaConnected(s.connected);
        setCaLastSync(s.lastSyncAt);
      })
      .catch(() => {
        setCaConnected(false);
      });
  }, [refreshToken]);

  const handlePeriodPresetChange = (preset: FinanceiroPeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === 'todos') {
      setDataInicio('');
      setDataFim('');
      return;
    }
    if (preset === 'mes') {
      const range = defaultMonthRange();
      setDataInicio(range.dataInicio);
      setDataFim(range.dataFim);
    }
  };

  const handlePeriodChange = (patch: Partial<typeof period>) => {
    setPeriodPreset('personalizado');
    const base = { dataInicio, dataFim };
    if (patch.dataInicio != null) {
      const next = adjustRangeOnDateChange('dataInicio', patch.dataInicio, base);
      setDataInicio(next.dataInicio);
      setDataFim(next.dataFim);
      return;
    }
    if (patch.dataFim != null) {
      const next = adjustRangeOnDateChange('dataFim', patch.dataFim, base);
      setDataInicio(next.dataInicio);
      setDataFim(next.dataFim);
    }
  };

  const handleConnectCa = async () => {
    setExportError(null);
    setCaBusy(true);
    try {
      const res = await erpFetchJson<{ url: string; state: string }>(
        'api/financeiro/conta-azul/auth-url',
      );
      setCaState(res.state);
      setCaCode('');
      setCaCodeOpen(true);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erro ao abrir autorização da Conta Azul.');
    } finally {
      setCaBusy(false);
    }
  };

  const submitCaCode = async () => {
    const raw = caCode.trim();
    const fromUrl = /[?&]code=([^&]+)/.exec(raw);
    const code = decodeURIComponent(fromUrl?.[1] ?? raw);
    if (!code) return;
    setCaBusy(true);
    setExportError(null);
    try {
      await erpFetchJson('api/financeiro/conta-azul/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state: caState || undefined }),
      });
      setCaCodeOpen(false);
      setCaCode('');
      setCaConnected(true);
      setCaSyncProgress('Sincronizando...');
      await pollCaSync(setCaSyncProgress);
      setRefreshToken((t) => t + 1);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erro ao conectar Conta Azul.');
    } finally {
      setCaBusy(false);
      setCaSyncProgress(null);
    }
  };

  const handleSyncCa = async () => {
    if (!caConnected) {
      setExportError('Conecte a Conta Azul antes de sincronizar.');
      return;
    }
    setCaBusy(true);
    setExportError(null);
    setCaSyncProgress('Sincronizando...');
    try {
      await pollCaSync(setCaSyncProgress);
      setRefreshToken((t) => t + 1);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erro ao sincronizar Conta Azul.');
    } finally {
      setCaBusy(false);
      setCaSyncProgress(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setExportError(null);
    try {
      await erpFetchJson('api/financeiro/sync', { method: 'POST' });
      setRefreshToken((t) => t + 1);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erro ao sincronizar NFs.');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = useCallback(async () => {
    setExportError(null);
    try {
      const periodQuery = buildFinanceiroPeriodQuery(period);

      if (tab === 'dashboard') {
        const dashboard = await erpFetchJson<FinanceiroDashboard>(
          `api/financeiro/dashboard${periodQuery}`,
        );
        downloadCsv('financeiro-dashboard.csv', ['Métrica', 'Valor'], [
          ['Pedidos no Período', String(dashboard.valorPedidosPeriodo)],
          ['Faturado no Período', String(dashboard.valorFaturadoPeriodo)],
          ['Total Histórico de Pedidos', String(dashboard.valorPedidosHistorico)],
          ['Total Histórico Faturado', String(dashboard.valorFaturadoHistorico)],
          ['Faturamento do período (NFs)', String(dashboard.valorPedidosPeriodo ?? 0)],
          ['Total recebido', String(dashboard.totalPago)],
          ['Total em aberto', String(dashboard.totalEmAberto)],
          ['Total atrasado', String(dashboard.totalAtrasado)],
          ['Despesas do período', String(dashboard.despesasMes)],
          ['Lucro bruto', String(dashboard.lucroBruto)],
        ]);
        return;
      }

      if (tab === 'nfs') {
        const nfs = filterNfsByPeriod(
          await fetchAllNfsEmAberto(),
          period.dataInicio,
          period.dataFim,
        );
        downloadCsv('financeiro-nfs-em-aberto.csv', NFS_CSV_HEADERS, nfsToCsvRows(nfs));
        return;
      }

      if (tab === 'atraso') {
        const atraso = await erpFetchJson<ContasAtrasoResponse>(
          'api/financeiro/contas-atraso',
        );
        downloadCsv(
          'financeiro-contas-atraso.csv',
          ATRASO_CSV_HEADERS,
          contasAtrasoToCsvRows(atraso.grupos),
        );
        return;
      }

      if (tab === 'despesas') {
        const despesas = await erpFetchJson<Despesa[]>(
          `api/financeiro/despesas${periodQuery}`,
        );
        downloadCsv(
          'financeiro-despesas.csv',
          DESPESAS_CSV_HEADERS,
          despesasToCsvRows(despesas),
        );
        return;
      }

      const extrato = await erpFetchJson<ExtratoResponse>(
        `api/financeiro/extrato${periodQuery}`,
      );
      downloadCsv(
        'financeiro-extrato.csv',
        EXTRATO_CSV_HEADERS,
        extratoToCsvRows(extrato),
      );
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Erro ao exportar.');
    }
  }, [period.dataFim, period.dataInicio, tab]);

  return (
    <div
      className="fin-root flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-4 overflow-hidden rounded-2xl p-2 sm:gap-5 sm:p-0"
      style={{ color: 'var(--fin-text)' }}
    >
      <div className="shrink-0">
        <FinanceiroHeader
          tab={tab}
          onTabChange={setTab}
          period={period}
          periodPreset={periodPreset}
          onPeriodPresetChange={handlePeriodPresetChange}
          onPeriodChange={handlePeriodChange}
          syncing={syncing}
          onSync={() => void handleSync()}
          onExport={() => void handleExport()}
          nfsCount={nfsCount}
          atrasoCount={atrasoCount}
          caConnected={caConnected}
          caLastSync={caLastSync}
          caBusy={caBusy}
          caSyncProgress={caSyncProgress}
          canEditCa={canEditCa}
          onConnectCa={() => void handleConnectCa()}
          onSyncCa={() => void handleSyncCa()}
        />
      </div>

      {caCodeOpen ? (
        <div className="fin-card shrink-0 rounded-2xl p-4">
          <p className="text-sm text-[var(--fin-text)]">
            Autorize no navegador e cole aqui o <strong>code</strong> da URL
            (ou a URL completa) para conectar a conta real da Conta Azul.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={caCode}
              onChange={(e) => setCaCode(e.target.value)}
              placeholder="code=... ou https://contaazul.com/?code=..."
              className="fin-input h-9 flex-1 rounded-lg px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => void submitCaCode()}
              disabled={caBusy || !caCode.trim()}
              className="inline-flex h-9 items-center justify-center rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: 'var(--fin-accent)' }}
            >
              Conectar
            </button>
            <button
              type="button"
              onClick={() => setCaCodeOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-lg border px-4 text-xs font-semibold"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {exportError ? (
        <p className="shrink-0 text-sm text-[var(--fin-danger)]" role="alert">
          {exportError}
        </p>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === 'dashboard' ? (
          <div className="lista-container">
            <FinanceiroDashboardTab period={period} refreshToken={refreshToken} />
          </div>
        ) : null}
        {tab === 'nfs' ? (
          <FinanceiroNfsTab
            period={period}
            refreshToken={refreshToken}
            onCountChange={setNfsCount}
          />
        ) : null}
        {tab === 'atraso' ? (
          <FinanceiroAtrasoTab refreshToken={refreshToken} />
        ) : null}
        {tab === 'despesas' ? (
          <FinanceiroDespesasTab period={period} refreshToken={refreshToken} />
        ) : null}
        {tab === 'extrato' ? (
          <FinanceiroExtratoTab period={period} refreshToken={refreshToken} />
        ) : null}
      </section>
    </div>
  );
}
