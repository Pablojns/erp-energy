'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageSearch, RefreshCw, Search, Truck } from 'lucide-react';
import {
  CORREIOS_SERVICES,
  type CorreiosServiceId,
  type CorreiosTrackingEvent,
  cotarCorreios,
  parseCorreiosTrackingEvents,
  rastrearCorreios,
  rastrearCorreiosLote,
} from '@/src/services/api/correios-api';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';

type TabId = 'cotacao' | 'rastreamento' | 'pedidos';

type TrackedOrderRow = {
  id: string;
  numero: string;
  receiverName: string;
  carrierName: string;
  trackingCode: string;
  lastStatus: string;
};

const DEFAULT_CEP_ORIGEM = '86057-170';

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function latestTrackingDescription(data: unknown): string {
  const eventos = parseCorreiosTrackingEvents(data);
  return eventos[0]?.descricao ?? 'Sem eventos';
}

export function CorreiosWorkspace() {
  const [tab, setTab] = useState<TabId>('cotacao');

  const [cepOrigem, setCepOrigem] = useState(DEFAULT_CEP_ORIGEM);
  const [cepDestino, setCepDestino] = useState('');
  const [servico, setServico] = useState<CorreiosServiceId>('PAC');
  const [cotando, setCotando] = useState(false);
  const [cotacaoErro, setCotacaoErro] = useState<string | null>(null);
  const [cotacaoValor, setCotacaoValor] = useState<string | null>(null);
  const [cotacaoPrazo, setCotacaoPrazo] = useState<number | null>(null);

  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [rastreando, setRastreando] = useState(false);
  const [rastreioErro, setRastreioErro] = useState<string | null>(null);
  const [rastreioEventos, setRastreioEventos] = useState<CorreiosTrackingEvent[]>([]);

  const [pedidos, setPedidos] = useState<TrackedOrderRow[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosErro, setPedidosErro] = useState<string | null>(null);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);

  const servicoSelecionado = useMemo(
    () => CORREIOS_SERVICES.find((s) => s.id === servico) ?? CORREIOS_SERVICES[0],
    [servico],
  );

  const loadPedidosComRastreio = useCallback(async () => {
    setPedidosLoading(true);
    setPedidosErro(null);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '100',
        sortBy: 'orderDate',
        sortOrder: 'desc',
      });
      const res = await erpFetchJson<{ data: Record<string, unknown>[] }>(
        `api/pedidos?${params.toString()}`,
        pedidosListFetchInit,
      );
      const rows = res.data
        .map((row) => normalizePedidoFromApi(row))
        .filter((order: OrderDto) => Boolean(order.trackingCode?.trim()))
        .map((order: OrderDto) => ({
          id: order.id,
          numero: orderDisplayNumber(order),
          receiverName: order.receiverName?.trim() || '—',
          carrierName: order.carrierName?.trim() || '—',
          trackingCode: order.trackingCode!.trim(),
          lastStatus: '—',
        }));
      setPedidos(rows);
    } catch (error) {
      setPedidosErro(
        error instanceof Error ? error.message : 'Falha ao carregar pedidos com rastreio.',
      );
      setPedidos([]);
    } finally {
      setPedidosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'pedidos') {
      void loadPedidosComRastreio();
    }
  }, [loadPedidosComRastreio, tab]);

  const handleCotar = async () => {
    setCotando(true);
    setCotacaoErro(null);
    setCotacaoValor(null);
    setCotacaoPrazo(null);
    try {
      const result = await cotarCorreios({
        codigoServico: servicoSelecionado.codigo,
        cepOrigem,
        cepDestino,
      });
      if (result.erro) {
        setCotacaoErro(result.erro);
        return;
      }
      if (!result.valor && result.prazoDias == null) {
        setCotacaoErro('Não foi possível obter cotação para os CEPs informados.');
        return;
      }
      setCotacaoValor(result.valor);
      setCotacaoPrazo(result.prazoDias);
    } finally {
      setCotando(false);
    }
  };

  const handleRastrear = async () => {
    const codigo = codigoRastreio.trim().toUpperCase();
    if (!codigo) {
      setRastreioErro('Informe o código de rastreio.');
      return;
    }
    setRastreando(true);
    setRastreioErro(null);
    setRastreioEventos([]);
    try {
      const result = await rastrearCorreios(codigo);
      if (result.eventos.length === 0) {
        setRastreioErro('Nenhum evento encontrado para este código.');
        return;
      }
      setRastreioEventos(result.eventos);
    } catch (error) {
      setRastreioErro(
        error instanceof Error ? error.message : 'Falha ao rastrear objeto.',
      );
    } finally {
      setRastreando(false);
    }
  };

  const handleAtualizarTodos = async () => {
    if (pedidos.length === 0) return;
    setAtualizandoStatus(true);
    setPedidosErro(null);
    try {
      const codigos = [...new Set(pedidos.map((p) => p.trackingCode))];
      const data = await rastrearCorreiosLote(codigos);
      const objetos = (() => {
        if (!data || typeof data !== 'object') return [];
        const root = data as Record<string, unknown>;
        return Array.isArray(root.objetos) ? root.objetos : [];
      })();

      const statusByCode = new Map<string, string>();
      for (const objeto of objetos) {
        if (!objeto || typeof objeto !== 'object') continue;
        const row = objeto as Record<string, unknown>;
        const codigo = String(row.codObjeto ?? row.codigo ?? '').trim().toUpperCase();
        if (!codigo) continue;
        statusByCode.set(codigo, latestTrackingDescription(objeto));
      }

      setPedidos((prev) =>
        prev.map((row) => ({
          ...row,
          lastStatus: statusByCode.get(row.trackingCode.toUpperCase()) ?? row.lastStatus,
        })),
      );
    } catch (error) {
      setPedidosErro(
        error instanceof Error ? error.message : 'Falha ao atualizar status dos pedidos.',
      );
    } finally {
      setAtualizandoStatus(false);
    }
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'cotacao', label: 'Cotação de Frete' },
    { id: 'rastreamento', label: 'Rastreamento' },
    { id: 'pedidos', label: 'Acompanhamento de Pedidos' },
  ];

  return (
    <div className="scroll-mt-8 space-y-4 pt-2 sm:pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Correios</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Cotação, rastreamento e acompanhamento de envios.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? 'bg-[var(--accent)] text-[var(--color-text-inverse)]'
                : 'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'cotacao' ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Truck className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Cotação de Frete
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">CEP de origem</span>
              <input
                value={cepOrigem}
                onChange={(e) => setCepOrigem(formatCepInput(e.target.value))}
                placeholder="00000-000"
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">CEP destino</span>
              <input
                value={cepDestino}
                onChange={(e) => setCepDestino(formatCepInput(e.target.value))}
                placeholder="00000-000"
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm md:col-span-2 xl:col-span-1">
              <span className="mb-1 block text-[var(--text-secondary)]">Serviço</span>
              <select
                value={servico}
                onChange={(e) => setServico(e.target.value as CorreiosServiceId)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {CORREIOS_SERVICES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                disabled={cotando}
                onClick={() => void handleCotar()}
                className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
              >
                {cotando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Cotar
              </button>
            </div>
          </div>

          {cotacaoErro ? (
            <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {cotacaoErro}
            </p>
          ) : null}

          {cotacaoValor || cotacaoPrazo != null ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                  Valor do frete
                </p>
                <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                  {cotacaoValor ?? '—'}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                  Prazo
                </p>
                <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                  {cotacaoPrazo != null ? `${cotacaoPrazo} dia(s) úteis` : '—'}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'rastreamento' ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <PackageSearch className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Rastreamento</h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={codigoRastreio}
              onChange={(e) => setCodigoRastreio(e.target.value.toUpperCase())}
              placeholder="Ex.: AA123456789BR"
              className="flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <button
              type="button"
              disabled={rastreando}
              onClick={() => void handleRastrear()}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
            >
              {rastreando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Rastrear
            </button>
          </div>

          {rastreioErro ? (
            <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {rastreioErro}
            </p>
          ) : null}

          {rastreioEventos.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--input-bg)] text-left text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Hora</th>
                    <th className="px-3 py-2">Local</th>
                    <th className="px-3 py-2">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {rastreioEventos.map((evento, index) => (
                    <tr
                      key={`${evento.data}-${evento.hora}-${index}`}
                      className="border-t border-[var(--border-color)]"
                    >
                      <td className="px-3 py-2 text-[var(--text-primary)]">{evento.data}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{evento.hora}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{evento.local}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{evento.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'pedidos' ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-[var(--accent)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Acompanhamento de Pedidos
              </h2>
            </div>
            <button
              type="button"
              disabled={atualizandoStatus || pedidos.length === 0}
              onClick={() => void handleAtualizarTodos()}
              className="inline-flex h-[40px] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
            >
              {atualizandoStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Atualizar status de todos
            </button>
          </div>

          {pedidosErro ? (
            <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {pedidosErro}
            </p>
          ) : null}

          {pedidosLoading ? (
            <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--text-secondary)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando pedidos com rastreio…
            </div>
          ) : pedidos.length === 0 ? (
            <p className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              Nenhum pedido com código de rastreio encontrado.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--input-bg)] text-left text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">Recebedor</th>
                    <th className="px-3 py-2">Transportadora</th>
                    <th className="px-3 py-2">Rastreio</th>
                    <th className="px-3 py-2">Último status</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((row) => (
                    <tr key={row.id} className="border-t border-[var(--border-color)]">
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        #{row.numero}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.receiverName}</td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.carrierName}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
                        {row.trackingCode}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.lastStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
