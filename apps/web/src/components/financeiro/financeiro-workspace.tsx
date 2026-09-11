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
import { CaPreviewModal } from '@/src/components/financeiro/modals';
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

type CadastroFieldDiff = { from: string; to: string };

type PessoaDivergence = {
  tipo: 'nome' | 'endereco' | 'so_conta_azul' | 'so_erp';
  kind: string;
  cnpj: string;
  name?: CadastroFieldDiff | null;
  address?: CadastroFieldDiff | null;
  erpName?: string;
  caName?: string;
};

type CadastrosPreview = {
  applied: boolean;
  message: string;
  pessoas: { mapeadas: number };
  divergencias: {
    nome: number;
    endereco: number;
    soNaContaAzul: number;
    soNoErp: number;
    preview: PessoaDivergence[];
  };
  catalogos: { categorias: number; centrosCusto: number };
  erpApply?: {
    pedidosVinculados: number;
    criar?: { customers: number; suppliers: number; carriers: number };
    atualizar?: { customers: number; suppliers: number; carriers: number };
    previewPedidos?: {
      code: string;
      externalOrderNumber: string | null;
      cnpj: string;
    }[];
  };
};

type VendaVinculoPreview = {
  vendaNumero: string | null;
  orderCode: string;
  externalOrderNumber: string | null;
  reason: string;
};

type VendaSemMatch = {
  vendaNumero: string | null;
  clienteNome: string | null;
  motivo: string;
};

type VendasPreview = {
  applied: boolean;
  message: string;
  vendas: number;
  pedidos: number;
  vinculados: number;
  semCorrespondencia: number;
  previewClaros: VendaVinculoPreview[];
  previewSemMatch: VendaSemMatch[];
};

type PedidoCadastroFillPreview = {
  applied: boolean;
  message: string;
  pedidosElegiveis: number;
  cnpjsBuscados: number;
  encontradosNaCa: number;
  semMatch: number;
  semDadosCompletos: number;
  aAtualizar: number;
  preview: {
    code: string;
    externalOrderNumber: string | null;
    cnpj: string;
    receiverName: string | null;
    name?: CadastroFieldDiff | null;
    address?: CadastroFieldDiff | null;
  }[];
};

type CaPreviewKind = 'cadastros' | 'vendas' | 'pedidos-cadastro';

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
  const [caPreviewKind, setCaPreviewKind] = useState<CaPreviewKind | null>(null);
  const [caPreviewLoading, setCaPreviewLoading] = useState(false);
  const [caPreviewApplying, setCaPreviewApplying] = useState(false);
  const [caPreviewError, setCaPreviewError] = useState<string | null>(null);
  const [cadastrosPreview, setCadastrosPreview] = useState<CadastrosPreview | null>(null);
  const [vendasPreview, setVendasPreview] = useState<VendasPreview | null>(null);
  const [pedidosCadastroPreview, setPedidosCadastroPreview] =
    useState<PedidoCadastroFillPreview | null>(null);

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

  const closeCaPreview = () => {
    if (caPreviewLoading || caPreviewApplying) return;
    setCaPreviewKind(null);
    setCaPreviewError(null);
    setCadastrosPreview(null);
    setVendasPreview(null);
    setPedidosCadastroPreview(null);
  };

  const handlePreviewCadastros = async () => {
    if (!caConnected) {
      setExportError('Conecte a Conta Azul antes de sincronizar.');
      return;
    }
    setExportError(null);
    setCaPreviewKind('cadastros');
    setCadastrosPreview(null);
    setVendasPreview(null);
    setPedidosCadastroPreview(null);
    setCaPreviewError(null);
    setCaPreviewLoading(true);
    setCaBusy(true);
    try {
      const res = await erpFetchJson<CadastrosPreview>(
        'api/financeiro/conta-azul/sincronizar-cadastros?dry-run=true',
        { method: 'POST' },
      );
      setCadastrosPreview(res);
    } catch (e) {
      setCaPreviewError(
        e instanceof Error ? e.message : 'Erro ao consultar cadastros da Conta Azul.',
      );
    } finally {
      setCaPreviewLoading(false);
      setCaBusy(false);
    }
  };

  const handlePreviewVendas = async () => {
    if (!caConnected) {
      setExportError('Conecte a Conta Azul antes de sincronizar.');
      return;
    }
    setExportError(null);
    setCaPreviewKind('vendas');
    setCadastrosPreview(null);
    setVendasPreview(null);
    setPedidosCadastroPreview(null);
    setCaPreviewError(null);
    setCaPreviewLoading(true);
    setCaBusy(true);
    try {
      const res = await erpFetchJson<VendasPreview>(
        'api/financeiro/conta-azul/sincronizar-vendas?dry-run=true',
        { method: 'POST' },
      );
      setVendasPreview(res);
    } catch (e) {
      setCaPreviewError(
        e instanceof Error ? e.message : 'Erro ao consultar vendas da Conta Azul.',
      );
    } finally {
      setCaPreviewLoading(false);
      setCaBusy(false);
    }
  };

  const handlePreviewPedidosCadastro = async () => {
    if (!caConnected) {
      setExportError('Conecte a Conta Azul antes de sincronizar.');
      return;
    }
    setExportError(null);
    setCaPreviewKind('pedidos-cadastro');
    setCadastrosPreview(null);
    setVendasPreview(null);
    setPedidosCadastroPreview(null);
    setCaPreviewError(null);
    setCaPreviewLoading(true);
    setCaBusy(true);
    try {
      const res = await erpFetchJson<PedidoCadastroFillPreview>(
        'api/financeiro/conta-azul/preencher-pedidos-cadastro?dry-run=true',
        { method: 'POST' },
      );
      setPedidosCadastroPreview(res);
    } catch (e) {
      setCaPreviewError(
        e instanceof Error
          ? e.message
          : 'Erro ao consultar pedidos e cadastros da Conta Azul.',
      );
    } finally {
      setCaPreviewLoading(false);
      setCaBusy(false);
    }
  };

  const handleApplyPreview = async () => {
    if (!caPreviewKind) return;
    setCaPreviewApplying(true);
    setCaPreviewError(null);
    setCaBusy(true);
    try {
      if (caPreviewKind === 'cadastros') {
        const res = await erpFetchJson<CadastrosPreview>(
          'api/financeiro/conta-azul/sincronizar-cadastros?apply=true',
          { method: 'POST' },
        );
        setCadastrosPreview(res);
      } else if (caPreviewKind === 'vendas') {
        const res = await erpFetchJson<VendasPreview>(
          'api/financeiro/conta-azul/sincronizar-vendas?apply=true',
          { method: 'POST' },
        );
        setVendasPreview(res);
      } else {
        const res = await erpFetchJson<PedidoCadastroFillPreview>(
          'api/financeiro/conta-azul/preencher-pedidos-cadastro?apply=true',
          { method: 'POST' },
        );
        setPedidosCadastroPreview(res);
      }
      setRefreshToken((t) => t + 1);
    } catch (e) {
      setCaPreviewError(
        e instanceof Error ? e.message : 'Erro ao aplicar a sincronização.',
      );
    } finally {
      setCaPreviewApplying(false);
      setCaBusy(false);
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
          onSyncCadastros={() => void handlePreviewCadastros()}
          onSyncVendas={() => void handlePreviewVendas()}
          onSyncPedidosCadastro={() => void handlePreviewPedidosCadastro()}
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

      <CaPreviewModal
        open={caPreviewKind != null}
        title={
          caPreviewKind === 'vendas'
            ? 'Vincular vendas a pedidos'
            : caPreviewKind === 'pedidos-cadastro'
              ? 'Preencher comprador e endereço'
              : 'Sincronizar cadastros'
        }
        loading={caPreviewLoading}
        applying={caPreviewApplying}
        error={caPreviewError}
        applied={
          caPreviewKind === 'vendas'
            ? Boolean(vendasPreview?.applied)
            : caPreviewKind === 'pedidos-cadastro'
              ? Boolean(pedidosCadastroPreview?.applied)
              : Boolean(cadastrosPreview?.applied)
        }
        appliedMessage={
          caPreviewKind === 'vendas'
            ? vendasPreview?.applied
              ? vendasPreview.message
              : null
            : caPreviewKind === 'pedidos-cadastro'
              ? pedidosCadastroPreview?.applied
                ? pedidosCadastroPreview.message
                : null
              : cadastrosPreview?.applied
                ? cadastrosPreview.message
                : null
        }
        onClose={closeCaPreview}
        onApply={() => void handleApplyPreview()}
      >
        {caPreviewKind === 'cadastros' && cadastrosPreview ? (
          <div className="space-y-3 text-sm text-[var(--fin-text)]">
            <p>
              <strong>{cadastrosPreview.pessoas.mapeadas}</strong> pessoas
              encontradas na Conta Azul.
            </p>
            <p>
              Divergências: {cadastrosPreview.divergencias.nome} nome,{' '}
              {cadastrosPreview.divergencias.endereco} endereço,{' '}
              {cadastrosPreview.divergencias.soNaContaAzul} só na Conta Azul,{' '}
              {cadastrosPreview.divergencias.soNoErp} só no ERP.
            </p>
            <p className="text-xs text-[var(--fin-text-secondary)]">
              Catálogos: {cadastrosPreview.catalogos.categorias} categorias,{' '}
              {cadastrosPreview.catalogos.centrosCusto} centros de custo. Aplicar
              cria/atualiza Customer, Supplier e Carrier no ERP e vincula
              pedidos pelo CNPJ de entrega.
            </p>
            {cadastrosPreview.erpApply &&
            cadastrosPreview.erpApply.pedidosVinculados > 0 ? (
              <p>
                <strong>{cadastrosPreview.erpApply.pedidosVinculados}</strong>{' '}
                pedido(s) serão vinculados ao cadastro do CNPJ de entrega.
                {cadastrosPreview.erpApply.criar
                  ? ` Criar: ${cadastrosPreview.erpApply.criar.customers} cliente(s), ${cadastrosPreview.erpApply.criar.suppliers} fornecedor(es), ${cadastrosPreview.erpApply.criar.carriers} transportadora(s).`
                  : ''}
              </p>
            ) : null}
            {cadastrosPreview.erpApply?.previewPedidos &&
            cadastrosPreview.erpApply.previewPedidos.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {cadastrosPreview.erpApply.previewPedidos.map((row) => (
                  <li key={`${row.code}-${row.cnpj}`}>
                    Pedido {row.code}
                    {row.externalOrderNumber
                      ? ` (${row.externalOrderNumber})`
                      : ''}{' '}
                    ← CNPJ {row.cnpj}
                  </li>
                ))}
              </ul>
            ) : null}
            {cadastrosPreview.divergencias.preview.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {cadastrosPreview.divergencias.preview.map((row, idx) => {
                  const before =
                    row.name?.from ??
                    row.address?.from ??
                    row.erpName ??
                    '—';
                  const after =
                    row.name?.to ??
                    row.address?.to ??
                    row.caName ??
                    '—';
                  const label =
                    row.tipo === 'nome'
                      ? 'Nome'
                      : row.tipo === 'endereco'
                        ? 'Endereço'
                        : row.tipo === 'so_conta_azul'
                          ? 'Só na Conta Azul'
                          : 'Só no ERP';
                  return (
                    <li key={`${row.cnpj}-${idx}`}>
                      <span className="font-semibold">{label}</span>
                      {row.cnpj ? ` · ${row.cnpj}` : ''}
                      {row.tipo === 'nome' || row.tipo === 'endereco'
                        ? `: ${before} → ${after}`
                        : row.caName || row.erpName
                          ? `: ${row.caName || row.erpName}`
                          : ''}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-[var(--fin-text-secondary)]">
                Nenhum exemplo de divergência neste preview.
              </p>
            )}
          </div>
        ) : null}
        {caPreviewKind === 'vendas' && vendasPreview ? (
          <div className="space-y-3 text-sm text-[var(--fin-text)]">
            <p>
              <strong>{vendasPreview.vinculados}</strong> vínculos claros em{' '}
              {vendasPreview.vendas} vendas × {vendasPreview.pedidos} pedidos.{' '}
              <strong>{vendasPreview.semCorrespondencia}</strong> sem
              correspondência.
            </p>
            {vendasPreview.previewClaros.length > 0 ? (
              <ul className="space-y-1.5 text-xs">
                {vendasPreview.previewClaros.map((row) => (
                  <li key={`${row.orderCode}-${row.vendaNumero ?? ''}`}>
                    Pedido {row.orderCode}
                    {row.externalOrderNumber
                      ? ` (${row.externalOrderNumber})`
                      : ''}{' '}
                    ← venda {row.vendaNumero ?? '—'} ({row.reason})
                  </li>
                ))}
              </ul>
            ) : null}
            {vendasPreview.previewSemMatch.length > 0 ? (
              <div>
                <p className="text-xs font-semibold text-[var(--fin-text-secondary)]">
                  Sem correspondência (amostra)
                </p>
                <ul className="mt-1 space-y-1.5 text-xs">
                  {vendasPreview.previewSemMatch.map((row, idx) => (
                    <li key={`${row.vendaNumero ?? 'v'}-${idx}`}>
                      Venda {row.vendaNumero ?? '—'}
                      {row.clienteNome ? ` · ${row.clienteNome}` : ''} —{' '}
                      {row.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
        {caPreviewKind === 'pedidos-cadastro' && pedidosCadastroPreview ? (
          <div className="space-y-3 text-sm text-[var(--fin-text)]">
            <p>
              <strong>{pedidosCadastroPreview.aAtualizar}</strong> pedidos
              seriam atualizados de {pedidosCadastroPreview.pedidosElegiveis}{' '}
              elegíveis ({pedidosCadastroPreview.cnpjsBuscados} CNPJs
              consultados, {pedidosCadastroPreview.encontradosNaCa} na Conta
              Azul).
            </p>
            <p className="text-xs text-[var(--fin-text-secondary)]">
              Sem match na Conta Azul: {pedidosCadastroPreview.semMatch}. Sem
              endereço completo na origem: {pedidosCadastroPreview.semDadosCompletos}.
              Aplicar preenche comprador e endereço; o Recebedor não muda.
            </p>
            {pedidosCadastroPreview.preview.length > 0 ? (
              <ul className="space-y-2 text-xs">
                {pedidosCadastroPreview.preview.map((row) => (
                  <li key={row.code} className="rounded-md border p-2" style={{ borderColor: 'var(--fin-border)' }}>
                    <p className="font-semibold">
                      {row.code}
                      {row.externalOrderNumber ? ` · ${row.externalOrderNumber}` : ''}{' '}
                      · {row.cnpj}
                    </p>
                    {row.name ? (
                      <p>
                        Comprador: {row.name.from || '—'} → {row.name.to}
                      </p>
                    ) : null}
                    {row.address ? (
                      <p>
                        Endereço: {row.address.from || '(vazio)'} → {row.address.to}
                      </p>
                    ) : null}
                    <p className="text-[var(--fin-text-secondary)]">
                      Recebedor (sem alteração): {row.receiverName || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-[var(--fin-text-secondary)]">
                Nenhum pedido para atualizar neste preview.
              </p>
            )}
          </div>
        ) : null}
      </CaPreviewModal>

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
