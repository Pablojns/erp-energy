'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageSearch, RefreshCw, Search, Tag, Trash2, Truck } from 'lucide-react';
import {
  CORREIOS_SERVICES,
  type CorreiosServiceId,
  type CorreiosTrackingEvent,
  atualizarEtiquetaCorreios,
  baixarComprovanteEntrega,
  buscarCepCorreios,
  cancelarEtiquetaCorreios,
  cotarCorreios,
  criarPrePostagemManual,
  excluirEtiquetaCorreios,
  gerarRotuloCorreios,
  getCorreiosRemetentePadrao,
  isCorreiosObjetoEntregue,
  listCorreiosEtiquetas,
  type CorreiosEtiquetaDto,
  parseCorreiosTrackingEvents,
  rastrearCorreios,
  rastrearCorreiosLote,
} from '@/src/services/api/correios-api';
import { parseDeliveryAddress } from '@/src/components/cadastros/delivery-address';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidoApiUrl,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import { orderDisplayNumber } from '@/src/components/expedicao/shared/order-helpers';

type TabId = 'cotacao' | 'rastreamento' | 'pedidos' | 'etiqueta';

type TrackedOrderRow = {
  id: string;
  numero: string;
  receiverName: string;
  carrierName: string;
  trackingCode: string;
  lastStatus: string;
};

const DEFAULT_CEP_ORIGEM = '86057-170';

const COTACAO_SERVICES = CORREIOS_SERVICES.filter(
  (item) => item.id === 'PAC' || item.id === 'SEDEX',
);

const ETIQUETA_SERVICES = COTACAO_SERVICES;

function formatCepDisplay(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatEtiquetaDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function latestTrackingDescription(data: unknown): string {
  const eventos = parseCorreiosTrackingEvents(data);
  return eventos[0]?.descricao ?? 'Sem eventos';
}

function servicoIdFromLabel(servico: string): CorreiosServiceId {
  const normalized = servico.trim().toUpperCase();
  if (normalized.includes('SEDEX')) return 'SEDEX';
  if (normalized.includes('MINI')) return 'MINI';
  return 'PAC';
}

function extractCodigoRastreio(prePostagem: Record<string, unknown>): string {
  const candidates = [
    prePostagem.codigoObjeto,
    prePostagem.codigoRastreio,
    prePostagem.codigo,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

export function CorreiosWorkspace() {
  const [tab, setTab] = useState<TabId>('cotacao');

  const [cepOrigem, setCepOrigem] = useState(DEFAULT_CEP_ORIGEM);
  const [cepDestino, setCepDestino] = useState('');
  const [servico, setServico] = useState<CorreiosServiceId>('PAC');
  const [pesoGramas, setPesoGramas] = useState('500');
  const [comprimentoCm, setComprimentoCm] = useState('20');
  const [larguraCm, setLarguraCm] = useState('15');
  const [alturaCm, setAlturaCm] = useState('10');
  const [cotando, setCotando] = useState(false);
  const [cotacaoErro, setCotacaoErro] = useState<string | null>(null);
  const [cotacaoValor, setCotacaoValor] = useState<string | null>(null);
  const [cotacaoPrazo, setCotacaoPrazo] = useState<number | null>(null);

  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [rastreando, setRastreando] = useState(false);
  const [rastreioErro, setRastreioErro] = useState<string | null>(null);
  const [rastreioEventos, setRastreioEventos] = useState<CorreiosTrackingEvent[]>([]);
  const [rastreioCodigoAtual, setRastreioCodigoAtual] = useState('');
  const [baixandoComprovante, setBaixandoComprovante] = useState(false);

  const [destinatarioNome, setDestinatarioNome] = useState('');
  const [remetenteNome, setRemetenteNome] = useState('');
  const [remetenteCpfCnpj, setRemetenteCpfCnpj] = useState('');
  const [remetenteCep, setRemetenteCep] = useState('');
  const [remetenteLogradouro, setRemetenteLogradouro] = useState('');
  const [remetenteNumero, setRemetenteNumero] = useState('');
  const [remetenteComplemento, setRemetenteComplemento] = useState('');
  const [remetenteBairro, setRemetenteBairro] = useState('');
  const [remetenteCidade, setRemetenteCidade] = useState('');
  const [remetenteUf, setRemetenteUf] = useState('');
  const [carregandoRemetente, setCarregandoRemetente] = useState(false);
  const [remetenteInicializado, setRemetenteInicializado] = useState(false);
  const [etiquetaCep, setEtiquetaCep] = useState('');
  const [etiquetaLogradouro, setEtiquetaLogradouro] = useState('');
  const [etiquetaNumero, setEtiquetaNumero] = useState('');
  const [etiquetaComplemento, setEtiquetaComplemento] = useState('');
  const [etiquetaBairro, setEtiquetaBairro] = useState('');
  const [etiquetaCidade, setEtiquetaCidade] = useState('');
  const [etiquetaUf, setEtiquetaUf] = useState('');
  const [etiquetaServico, setEtiquetaServico] = useState<CorreiosServiceId>('PAC');
  const [etiquetaPeso, setEtiquetaPeso] = useState('300');
  const [etiquetaValor, setEtiquetaValor] = useState('0');
  const [etiquetaNumeroPed, setEtiquetaNumeroPed] = useState('');
  const [etiquetaCodigoRastreio, setEtiquetaCodigoRastreio] = useState('');
  const [editingEtiquetaId, setEditingEtiquetaId] = useState<string | null>(null);
  const [hasExistingTracking, setHasExistingTracking] = useState(false);
  const [buscandoPedidoEtiqueta, setBuscandoPedidoEtiqueta] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCepRemetente, setBuscandoCepRemetente] = useState(false);
  const [gerandoEtiqueta, setGerandoEtiqueta] = useState(false);
  const [etiquetaErro, setEtiquetaErro] = useState<string | null>(null);
  const [etiquetasEmitidas, setEtiquetasEmitidas] = useState<CorreiosEtiquetaDto[]>([]);
  const [etiquetasLoading, setEtiquetasLoading] = useState(false);
  const [etiquetaAcaoId, setEtiquetaAcaoId] = useState<string | null>(null);
  const [etiquetaBusca, setEtiquetaBusca] = useState('');

  const [pedidos, setPedidos] = useState<TrackedOrderRow[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosErro, setPedidosErro] = useState<string | null>(null);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);

  const servicoSelecionado = useMemo(
    () => COTACAO_SERVICES.find((s) => s.id === servico) ?? COTACAO_SERVICES[0],
    [servico],
  );

  const etiquetaServicoSelecionado = useMemo(
    () => ETIQUETA_SERVICES.find((s) => s.id === etiquetaServico) ?? ETIQUETA_SERVICES[0],
    [etiquetaServico],
  );

  const isAtualizarEtiquetaMode = Boolean(editingEtiquetaId || hasExistingTracking);

  const objetoEntregue = useMemo(
    () => isCorreiosObjetoEntregue(rastreioEventos),
    [rastreioEventos],
  );

  const etiquetasFiltradas = useMemo(() => {
    const termo = etiquetaBusca.trim().toLowerCase();
    if (!termo) return etiquetasEmitidas;
    return etiquetasEmitidas.filter((row) => {
      const nome = row.nomeDestinatario.toLowerCase();
      const rastreio = row.codigoRastreio.toLowerCase();
      return nome.includes(termo) || rastreio.includes(termo);
    });
  }, [etiquetaBusca, etiquetasEmitidas]);

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

  const loadRemetentePadrao = useCallback(async () => {
    setCarregandoRemetente(true);
    setEtiquetaErro(null);
    try {
      const data = await getCorreiosRemetentePadrao();
      setRemetenteNome(data.nome);
      setRemetenteCpfCnpj(data.cpfCnpj);
      setRemetenteCep(formatCepInput(data.cep));
      setRemetenteLogradouro(data.logradouro);
      setRemetenteNumero(data.numero);
      setRemetenteComplemento(data.complemento ?? '');
      setRemetenteBairro(data.bairro);
      setRemetenteCidade(data.cidade);
      setRemetenteUf(data.uf.toUpperCase().slice(0, 2));
      setRemetenteInicializado(true);
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao carregar remetente padrão.',
      );
    } finally {
      setCarregandoRemetente(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'etiqueta' && !remetenteInicializado) {
      void loadRemetentePadrao();
    }
  }, [loadRemetentePadrao, remetenteInicializado, tab]);

  const loadEtiquetasEmitidas = useCallback(async () => {
    setEtiquetasLoading(true);
    try {
      const rows = await listCorreiosEtiquetas();
      setEtiquetasEmitidas(rows);
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao carregar etiquetas emitidas.',
      );
    } finally {
      setEtiquetasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'etiqueta') {
      void loadEtiquetasEmitidas();
    }
  }, [loadEtiquetasEmitidas, tab]);

  const handleCotar = async () => {
    setCotando(true);
    setCotacaoErro(null);
    setCotacaoValor(null);
    setCotacaoPrazo(null);
    try {
      const peso = Number(pesoGramas);
      const comprimento = Number(comprimentoCm);
      const largura = Number(larguraCm);
      const altura = Number(alturaCm);

      if (!Number.isFinite(peso) || peso < 1) {
        setCotacaoErro('Peso mínimo: 1g.');
        return;
      }
      if (
        !Number.isFinite(comprimento) ||
        !Number.isFinite(largura) ||
        !Number.isFinite(altura) ||
        comprimento < 16 ||
        largura < 11 ||
        altura < 2
      ) {
        setCotacaoErro('Dimensões mínimas dos Correios: 16 × 11 × 2 cm.');
        return;
      }

      const result = await cotarCorreios({
        codigoServico: servicoSelecionado.codigo,
        cepOrigem,
        cepDestino,
        pesoGramas: Math.round(peso),
        comprimento,
        largura,
        altura,
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
    setRastreioCodigoAtual('');
    try {
      const result = await rastrearCorreios(codigo);
      if (result.eventos.length === 0) {
        setRastreioErro('Nenhum evento encontrado para este código.');
        return;
      }
      setRastreioEventos(result.eventos);
      setRastreioCodigoAtual(result.codigo);
    } catch (error) {
      setRastreioErro(
        error instanceof Error ? error.message : 'Falha ao rastrear objeto.',
      );
    } finally {
      setRastreando(false);
    }
  };

  const handleBuscarCepRemetente = async (cepValue = remetenteCep) => {
    const digits = cepValue.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setBuscandoCepRemetente(true);
    setEtiquetaErro(null);
    try {
      const data = await buscarCepCorreios(digits);
      setRemetenteLogradouro(data.logradouro ?? data.end ?? '');
      setRemetenteBairro(data.bairro ?? '');
      setRemetenteCidade(data.localidade ?? data.cidade ?? '');
      setRemetenteUf((data.uf ?? '').toUpperCase().slice(0, 2));
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao buscar CEP do remetente.',
      );
    } finally {
      setBuscandoCepRemetente(false);
    }
  };

  const handleBuscarCepEtiqueta = async (cepValue = etiquetaCep) => {
    const digits = cepValue.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setBuscandoCep(true);
    setEtiquetaErro(null);
    try {
      const data = await buscarCepCorreios(digits);
      setEtiquetaLogradouro(data.logradouro ?? data.end ?? '');
      setEtiquetaBairro(data.bairro ?? '');
      setEtiquetaCidade(data.localidade ?? data.cidade ?? '');
      setEtiquetaUf((data.uf ?? '').toUpperCase().slice(0, 2));
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao buscar CEP.',
      );
    } finally {
      setBuscandoCep(false);
    }
  };

  const syncRastreioPedido = async (trackingCode: string) => {
    const numeroPed = etiquetaNumeroPed.trim().replace(/^#/, '');
    if (!numeroPed || !trackingCode.trim()) return;
    await erpFetchJson(pedidoApiUrl(numeroPed, 'rastreio'), {
      method: 'PATCH',
      body: JSON.stringify({ trackingCode: trackingCode.trim() }),
    });
  };

  const fillDestinatarioFromPedido = (order: OrderDto) => {
    const nome =
      order.receiverName?.trim() || order.customerName?.trim() || '';
    setDestinatarioNome(nome);
    const address =
      parseDeliveryAddress(order.deliveryAddress) ??
      parseDeliveryAddress(order.unloadingPoint);
    if (address) {
      setEtiquetaCep(formatCepInput(address.cep));
      setEtiquetaLogradouro(address.logradouro);
      setEtiquetaNumero(address.numero);
      setEtiquetaComplemento(address.complemento);
      setEtiquetaBairro(address.bairro);
      setEtiquetaCidade(address.cidade);
      setEtiquetaUf(address.uf.toUpperCase().slice(0, 2));
      return;
    }
    if (order.deliveryCity) setEtiquetaCidade(order.deliveryCity);
    if (order.deliveryState) {
      setEtiquetaUf(order.deliveryState.toUpperCase().slice(0, 2));
    }
  };

  const handleBuscarPedidoEtiqueta = async () => {
    const numeroPed = etiquetaNumeroPed.trim().replace(/^#/, '');
    if (!numeroPed) return;

    setBuscandoPedidoEtiqueta(true);
    setEtiquetaErro(null);
    try {
      const raw = await erpFetchJson<Record<string, unknown>>(
        pedidoApiUrl(numeroPed),
        pedidosListFetchInit,
      );
      const order = normalizePedidoFromApi(raw);
      fillDestinatarioFromPedido(order);

      const tracking = order.trackingCode?.trim() || '';
      if (tracking) {
        setEtiquetaCodigoRastreio(tracking);
        setHasExistingTracking(true);
        const match = etiquetasEmitidas.find(
          (row) =>
            row.codigoRastreio.trim().toUpperCase() === tracking.toUpperCase() &&
            row.status === 'ATIVA',
        );
        setEditingEtiquetaId(match?.id ?? null);
        if (match) {
          setEtiquetaCep(formatCepInput(match.cepDestino));
          setDestinatarioNome(match.nomeDestinatario);
          setEtiquetaServico(servicoIdFromLabel(match.servico));
          if (match.cepDestino.replace(/\D/g, '').length === 8) {
            void handleBuscarCepEtiqueta(match.cepDestino);
          }
        }
      } else {
        setEtiquetaCodigoRastreio('');
        setHasExistingTracking(false);
        setEditingEtiquetaId(null);
      }
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Pedido não encontrado.',
      );
      setHasExistingTracking(false);
      setEditingEtiquetaId(null);
    } finally {
      setBuscandoPedidoEtiqueta(false);
    }
  };

  const handleEditarEtiqueta = (row: CorreiosEtiquetaDto) => {
    setEditingEtiquetaId(row.id);
    setHasExistingTracking(true);
    setEtiquetaCodigoRastreio(row.codigoRastreio);
    setDestinatarioNome(row.nomeDestinatario);
    setEtiquetaCep(formatCepInput(row.cepDestino));
    setEtiquetaServico(servicoIdFromLabel(row.servico));
    setEtiquetaErro(null);
    if (row.cepDestino.replace(/\D/g, '').length === 8) {
      void handleBuscarCepEtiqueta(row.cepDestino);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearEtiquetaEditMode = () => {
    setEditingEtiquetaId(null);
    setHasExistingTracking(false);
    setEtiquetaCodigoRastreio('');
  };

  const handleAtualizarEtiqueta = async () => {
    if (!destinatarioNome.trim()) {
      setEtiquetaErro('Informe o nome do destinatário.');
      return;
    }
    const codigo = etiquetaCodigoRastreio.trim();
    if (!codigo) {
      setEtiquetaErro('Informe o código de rastreio para atualizar.');
      return;
    }
    if (!editingEtiquetaId && !etiquetaNumeroPed.trim()) {
      setEtiquetaErro(
        'Selecione uma etiqueta existente ou informe o número do pedido.',
      );
      return;
    }

    setGerandoEtiqueta(true);
    setEtiquetaErro(null);
    try {
      if (editingEtiquetaId) {
        await atualizarEtiquetaCorreios(editingEtiquetaId, {
          codigoRastreio: codigo,
          nomeDestinatario: destinatarioNome.trim(),
          cepDestino: etiquetaCep,
          servico: etiquetaServicoSelecionado.label,
        });
      }
      await syncRastreioPedido(codigo);
      await loadEtiquetasEmitidas();
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao atualizar etiqueta.',
      );
    } finally {
      setGerandoEtiqueta(false);
    }
  };

  const handleGerarEtiqueta = async (forceNova = false) => {
    if (!remetenteNome.trim() || remetenteCep.replace(/\D/g, '').length !== 8) {
      setEtiquetaErro('Preencha os dados do remetente.');
      return;
    }
    if (
      !remetenteLogradouro.trim() ||
      !remetenteCidade.trim() ||
      !remetenteUf.trim() ||
      !remetenteCpfCnpj.trim()
    ) {
      setEtiquetaErro('Endereço do remetente incompleto.');
      return;
    }
    if (!destinatarioNome.trim()) {
      setEtiquetaErro('Informe o nome do destinatário.');
      return;
    }
    if (etiquetaCep.replace(/\D/g, '').length !== 8) {
      setEtiquetaErro('Informe um CEP válido.');
      return;
    }
    if (!etiquetaLogradouro.trim() || !etiquetaCidade.trim() || !etiquetaUf.trim()) {
      setEtiquetaErro('Preencha o endereço completo do destinatário.');
      return;
    }

    if (!forceNova && isAtualizarEtiquetaMode) {
      await handleAtualizarEtiqueta();
      return;
    }

    setGerandoEtiqueta(true);
    setEtiquetaErro(null);
    try {
      const prePostagem = await criarPrePostagemManual({
        remetente: {
          nome: remetenteNome.trim(),
          cpfCnpj: remetenteCpfCnpj.trim(),
          cep: remetenteCep,
          logradouro: remetenteLogradouro.trim(),
          numero: remetenteNumero.trim() || 'S/N',
          complemento: remetenteComplemento.trim(),
          bairro: remetenteBairro.trim(),
          cidade: remetenteCidade.trim(),
          uf: remetenteUf.trim(),
        },
        destinatarioNome: destinatarioNome.trim(),
        cep: etiquetaCep,
        logradouro: etiquetaLogradouro.trim(),
        numero: etiquetaNumero.trim() || 'S/N',
        complemento: etiquetaComplemento.trim(),
        bairro: etiquetaBairro.trim(),
        cidade: etiquetaCidade.trim(),
        uf: etiquetaUf.trim(),
        codigoServico: etiquetaServicoSelecionado.codigo,
        pesoGramas: Number(etiquetaPeso) || 300,
        valorDeclarado: Number(etiquetaValor.replace(',', '.')) || 0,
        servicoLabel: etiquetaServicoSelecionado.label,
      });

      const idPrePostagem =
        (typeof prePostagem.id === 'string' && prePostagem.id) ||
        (typeof prePostagem.idPrePostagem === 'string' && prePostagem.idPrePostagem) ||
        null;
      if (!idPrePostagem) {
        throw new Error('Correios não retornou o ID da pré-postagem.');
      }

      const codigoNovo = extractCodigoRastreio(prePostagem);
      if (codigoNovo) {
        await syncRastreioPedido(codigoNovo);
        setEtiquetaCodigoRastreio(codigoNovo);
      }

      await gerarRotuloCorreios([idPrePostagem]);
      await loadEtiquetasEmitidas();
      if (etiquetaNumeroPed.trim() && codigoNovo) {
        setEtiquetaCodigoRastreio(codigoNovo);
        setHasExistingTracking(true);
        setEditingEtiquetaId(null);
      } else {
        clearEtiquetaEditMode();
      }
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao gerar etiqueta.',
      );
    } finally {
      setGerandoEtiqueta(false);
    }
  };

  const handleReimprimirEtiqueta = async (row: CorreiosEtiquetaDto) => {
    setEtiquetaAcaoId(row.id);
    setEtiquetaErro(null);
    try {
      await gerarRotuloCorreios([row.prePostagemId]);
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao reimprimir etiqueta.',
      );
    } finally {
      setEtiquetaAcaoId(null);
    }
  };

  const handleCancelarEtiqueta = async (row: CorreiosEtiquetaDto) => {
    const confirmed = window.confirm(
      'Deseja cancelar a pré-postagem e excluir esta etiqueta?',
    );
    if (!confirmed) return;

    setEtiquetaAcaoId(row.id);
    setEtiquetaErro(null);
    try {
      await cancelarEtiquetaCorreios(row.prePostagemId);
      await loadEtiquetasEmitidas();
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao cancelar etiqueta.',
      );
    } finally {
      setEtiquetaAcaoId(null);
    }
  };

  const handleExcluirEtiqueta = async (row: CorreiosEtiquetaDto) => {
    const confirmed = window.confirm('Deseja excluir esta etiqueta do histórico?');
    if (!confirmed) return;

    setEtiquetaAcaoId(row.id);
    setEtiquetaErro(null);
    try {
      await excluirEtiquetaCorreios(row.id);
      await loadEtiquetasEmitidas();
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao excluir etiqueta.',
      );
    } finally {
      setEtiquetaAcaoId(null);
    }
  };

  const handleBaixarComprovante = async () => {
    const codigo = rastreioCodigoAtual.trim();
    if (!codigo) return;

    setBaixandoComprovante(true);
    setRastreioErro(null);
    try {
      await baixarComprovanteEntrega(codigo);
    } catch (error) {
      setRastreioErro(
        error instanceof Error ? error.message : 'Falha ao baixar comprovante.',
      );
    } finally {
      setBaixandoComprovante(false);
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
    { id: 'etiqueta', label: 'Etiqueta Manual' },
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

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Serviço</span>
              <select
                value={servico}
                onChange={(e) => setServico(e.target.value as CorreiosServiceId)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {COTACAO_SERVICES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Peso (gramas)</span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={pesoGramas}
                onChange={(e) => setPesoGramas(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Comprimento (cm)</span>
              <input
                type="number"
                min={16}
                step={1}
                inputMode="numeric"
                value={comprimentoCm}
                onChange={(e) => setComprimentoCm(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Largura (cm)</span>
              <input
                type="number"
                min={11}
                step={1}
                inputMode="numeric"
                value={larguraCm}
                onChange={(e) => setLarguraCm(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Altura (cm)</span>
              <input
                type="number"
                min={2}
                step={1}
                inputMode="numeric"
                value={alturaCm}
                onChange={(e) => setAlturaCm(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
          </div>

          <div className="mt-4 flex items-end">
            <button
              type="button"
              disabled={cotando}
              onClick={() => void handleCotar()}
              className="inline-flex h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60 sm:w-auto sm:min-w-[10rem]"
            >
              {cotando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Cotar
            </button>
          </div>

          {cotacaoErro ? (
            <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
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
            <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
              {rastreioErro}
            </p>
          ) : null}

          {rastreioEventos.length > 0 ? (
            <>
              {objetoEntregue ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={baixandoComprovante}
                    onClick={() => void handleBaixarComprovante()}
                    className="inline-flex h-[40px] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                  >
                    {baixandoComprovante ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Tag className="h-4 w-4" />
                    )}
                    Baixar Comprovante
                  </button>
                </div>
              ) : null}
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
            </>
          ) : null}
        </section>
      ) : null}

      {tab === 'etiqueta' ? (
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Tag className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Etiqueta Manual
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Remetente</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="block text-sm md:col-span-2 xl:col-span-3">
                  <span className="mb-1 block text-[var(--text-secondary)]">Nome do remetente</span>
                  <input
                    value={remetenteNome}
                    onChange={(e) => setRemetenteNome(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">CEP remetente</span>
                  <input
                    value={remetenteCep}
                    onChange={(e) => setRemetenteCep(formatCepInput(e.target.value))}
                    onBlur={() => void handleBuscarCepRemetente()}
                    placeholder="00000-000"
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--text-secondary)]">Logradouro</span>
                  <input
                    value={remetenteLogradouro}
                    onChange={(e) => setRemetenteLogradouro(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Número</span>
                  <input
                    value={remetenteNumero}
                    onChange={(e) => setRemetenteNumero(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="mb-1 block text-[var(--text-secondary)]">Complemento</span>
                  <input
                    value={remetenteComplemento}
                    onChange={(e) => setRemetenteComplemento(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Bairro</span>
                  <input
                    value={remetenteBairro}
                    onChange={(e) => setRemetenteBairro(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">Cidade</span>
                  <input
                    value={remetenteCidade}
                    onChange={(e) => setRemetenteCidade(e.target.value)}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-[var(--text-secondary)]">UF</span>
                  <input
                    value={remetenteUf}
                    onChange={(e) => setRemetenteUf(e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                    disabled={carregandoRemetente}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-60"
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Destinatário</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm md:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[var(--text-secondary)]">Nº do pedido (opcional)</span>
              <div className="flex gap-2">
                <input
                  value={etiquetaNumeroPed}
                  onChange={(e) => setEtiquetaNumeroPed(e.target.value)}
                  onBlur={() => void handleBuscarPedidoEtiqueta()}
                  placeholder="Ex: 12345"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  disabled={buscandoPedidoEtiqueta || !etiquetaNumeroPed.trim()}
                  onClick={() => void handleBuscarPedidoEtiqueta()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                >
                  {buscandoPedidoEtiqueta ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Buscar
                </button>
              </div>
            </label>
            <label className="block text-sm md:col-span-2 xl:col-span-3">
              <span className="mb-1 block text-[var(--text-secondary)]">Nome do destinatário</span>
              <input
                value={destinatarioNome}
                onChange={(e) => setDestinatarioNome(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">CEP destinatário</span>
              <input
                value={etiquetaCep}
                onChange={(e) => setEtiquetaCep(formatCepInput(e.target.value))}
                onBlur={() => void handleBuscarCepEtiqueta()}
                placeholder="00000-000"
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--text-secondary)]">Logradouro</span>
              <input
                value={etiquetaLogradouro}
                onChange={(e) => setEtiquetaLogradouro(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Número</span>
              <input
                value={etiquetaNumero}
                onChange={(e) => setEtiquetaNumero(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-[var(--text-secondary)]">Complemento</span>
              <input
                value={etiquetaComplemento}
                onChange={(e) => setEtiquetaComplemento(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Bairro</span>
              <input
                value={etiquetaBairro}
                onChange={(e) => setEtiquetaBairro(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Cidade</span>
              <input
                value={etiquetaCidade}
                onChange={(e) => setEtiquetaCidade(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">UF</span>
              <input
                value={etiquetaUf}
                onChange={(e) => setEtiquetaUf(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Envio</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Serviço</span>
              <select
                value={etiquetaServico}
                onChange={(e) => setEtiquetaServico(e.target.value as CorreiosServiceId)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                {ETIQUETA_SERVICES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Peso estimado (g)</span>
              <input
                type="number"
                min={1}
                value={etiquetaPeso}
                onChange={(e) => setEtiquetaPeso(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Valor declarado (R$)</span>
              <input
                value={etiquetaValor}
                onChange={(e) => setEtiquetaValor(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </label>
            {isAtualizarEtiquetaMode ? (
              <label className="block text-sm md:col-span-2 xl:col-span-3">
                <span className="mb-1 block text-[var(--text-secondary)]">
                  Código de rastreio
                </span>
                <input
                  value={etiquetaCodigoRastreio}
                  onChange={(e) => setEtiquetaCodigoRastreio(e.target.value)}
                  placeholder="Código atual da etiqueta"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </label>
            ) : null}
              </div>
            </div>
          </div>

          {carregandoRemetente ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Carregando remetente padrão…
            </p>
          ) : null}

          {buscandoCep || buscandoCepRemetente ? (
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Buscando endereço pelo CEP…
            </p>
          ) : null}

          {etiquetaErro ? (
            <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
              {etiquetaErro}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {isAtualizarEtiquetaMode ? (
              <>
                <button
                  type="button"
                  disabled={gerandoEtiqueta || buscandoCep || buscandoCepRemetente || carregandoRemetente}
                  onClick={() => void handleGerarEtiqueta(true)}
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
                >
                  {gerandoEtiqueta ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4" />
                  )}
                  Gerar Nova Etiqueta
                </button>
                <button
                  type="button"
                  disabled={gerandoEtiqueta || buscandoCep || buscandoCepRemetente || carregandoRemetente}
                  onClick={() => void handleAtualizarEtiqueta()}
                  className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
                >
                  {gerandoEtiqueta ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Tag className="h-4 w-4" />
                  )}
                  Atualizar Etiqueta
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={gerandoEtiqueta || buscandoCep || buscandoCepRemetente || carregandoRemetente}
                onClick={() => void handleGerarEtiqueta(false)}
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)] disabled:opacity-60"
              >
                {gerandoEtiqueta ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Tag className="h-4 w-4" />
                )}
                Gerar Etiqueta
              </button>
            )}
          </div>

          <div className="mt-8 border-t border-[var(--border-color)] pt-6">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
              Etiquetas Emitidas
            </h3>

            {etiquetasLoading ? (
              <div className="flex min-h-[120px] items-center justify-center text-sm text-[var(--text-secondary)]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando etiquetas…
              </div>
            ) : etiquetasEmitidas.length === 0 ? (
              <p className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                Nenhuma etiqueta manual emitida ainda.
              </p>
            ) : (
              <>
                <input
                  type="search"
                  value={etiquetaBusca}
                  onChange={(e) => setEtiquetaBusca(e.target.value)}
                  placeholder="Buscar por destinatário ou código de rastreio…"
                  className="mb-3 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                {etiquetasFiltradas.length === 0 ? (
                  <p className="rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                    Nenhuma etiqueta encontrada para esta busca.
                  </p>
                ) : (
                  <div className="max-h-[400px] overflow-y-auto overflow-x-auto rounded-xl border border-[var(--border-color)]">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-[var(--input-bg)] text-left text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-3 py-2">Rastreio</th>
                          <th className="px-3 py-2">Destinatário</th>
                          <th className="px-3 py-2">CEP</th>
                          <th className="px-3 py-2">Serviço</th>
                          <th className="px-3 py-2">Data</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {etiquetasFiltradas.map((row) => {
                          const isAtiva = row.status === 'ATIVA';
                          const acaoLoading = etiquetaAcaoId === row.id;
                          return (
                            <tr key={row.id} className="border-t border-[var(--border-color)]">
                              <td className="px-3 py-2 font-mono text-xs text-[var(--text-primary)]">
                                {row.codigoRastreio || '—'}
                              </td>
                              <td className="px-3 py-2 text-[var(--text-primary)]">
                                {row.nomeDestinatario}
                              </td>
                              <td className="px-3 py-2 text-[var(--text-primary)]">
                                {formatCepDisplay(row.cepDestino)}
                              </td>
                              <td className="px-3 py-2 text-[var(--text-primary)]">{row.servico}</td>
                              <td className="px-3 py-2 text-[var(--text-primary)]">
                                {formatEtiquetaDate(row.createdAt)}
                              </td>
                              <td className="px-3 py-2 text-[var(--text-primary)]">{row.status}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={acaoLoading}
                                    onClick={() => handleEditarEtiqueta(row)}
                                    className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!isAtiva || acaoLoading}
                                    onClick={() => void handleReimprimirEtiqueta(row)}
                                    className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                                  >
                                    {acaoLoading ? '…' : 'Reimprimir Etiqueta'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!isAtiva || acaoLoading}
                                    onClick={() => void handleCancelarEtiqueta(row)}
                                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-600 disabled:opacity-50"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={acaoLoading}
                                    onClick={() => void handleExcluirEtiqueta(row)}
                                    title="Excluir"
                                    aria-label="Excluir etiqueta do histórico"
                                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
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
            <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600">
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
