'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@/src/components/financeiro/types';
import {
  buildFinanceiroPeriodQuery,
  defaultMonthRange,
  downloadCsv,
  fetchAllNfsEmAberto,
  filterNfsByPeriod,
} from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  adjustRangeOnDateChange,
  normalizeDateRange,
} from '@/src/lib/period-range';
import '@/src/components/financeiro/financeiro.css';

export function FinanceiroWorkspace() {
  const defaultRange = useMemo(() => defaultMonthRange(), []);
  const [tab, setTab] = useState<FinanceiroTab>('dashboard');
  const [periodPreset, setPeriodPreset] = useState<FinanceiroPeriodPreset>('mes');
  const [dataInicio, setDataInicio] = useState(defaultRange.dataInicio);
  const [dataFim, setDataFim] = useState(defaultRange.dataFim);
  const [syncing, setSyncing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [nfsCount, setNfsCount] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);

  const period = useMemo(
    () => normalizeDateRange({ dataInicio, dataFim }),
    [dataInicio, dataFim],
  );

  useEffect(() => {
    void fetchAllNfsEmAberto()
      .then((nfs) => setNfsCount(nfs.length))
      .catch(() => setNfsCount(0));
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
        />
      </div>

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
