'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, PackageSearch, Search, Tag, Trash2 } from 'lucide-react';
import {
  type CorreiosServiceId,
  type CorreiosEtiquetaDto,
  atualizarEtiquetaCorreios,
  buscarCepCorreios,
  cancelarEtiquetaCorreios,
  criarPrePostagemManual,
  emitirDeclaracaoConteudoCorreios,
  excluirEtiquetaCorreios,
  gerarRotuloCorreios,
  getCorreiosRemetentePadrao,
  listCorreiosEtiquetas,
} from '@/src/services/api/correios-api';
import { parseDeliveryAddress } from '@/src/components/cadastros/delivery-address';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  normalizePedidoFromApi,
  pedidoApiUrl,
  pedidosListFetchInit,
} from '@/src/services/api/pedidos-normalize';
import type { OrderDto } from '@/src/components/expedicao/shared/types';
import {
  emptyDeclaracaoItem,
  ETIQUETA_SERVICES,
  extractCodigoRastreio,
  formatCepDisplay,
  formatCepInput,
  formatEtiquetaDate,
  servicoIdFromLabel,
  withAutoValorDeclarado,
} from '@/src/components/correios/correios-helpers';

export function CorreiosEtiquetaPanel() {
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
  const [declaracaoItens, setDeclaracaoItens] = useState(() => [emptyDeclaracaoItem()]);
  const [buscandoPedidoEtiqueta, setBuscandoPedidoEtiqueta] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoCepRemetente, setBuscandoCepRemetente] = useState(false);
  const [gerandoEtiqueta, setGerandoEtiqueta] = useState(false);
  const [etiquetaErro, setEtiquetaErro] = useState<string | null>(null);
  const [etiquetasEmitidas, setEtiquetasEmitidas] = useState<CorreiosEtiquetaDto[]>([]);
  const [etiquetasLoading, setEtiquetasLoading] = useState(false);
  const [etiquetaAcaoId, setEtiquetaAcaoId] = useState<string | null>(null);
  const [etiquetaBusca, setEtiquetaBusca] = useState('');

  const etiquetaServicoSelecionado = useMemo(
    () => ETIQUETA_SERVICES.find((s) => s.id === etiquetaServico) ?? ETIQUETA_SERVICES[0],
    [etiquetaServico],
  );

  const isAtualizarEtiquetaMode = Boolean(editingEtiquetaId || hasExistingTracking);

  const etiquetasFiltradas = useMemo(() => {
    const termo = etiquetaBusca.trim().toLowerCase();
    if (!termo) return etiquetasEmitidas;
    return etiquetasEmitidas.filter((row) => {
      const nome = row.nomeDestinatario.toLowerCase();
      const rastreio = row.codigoRastreio.toLowerCase();
      return nome.includes(termo) || rastreio.includes(termo);
    });
  }, [etiquetaBusca, etiquetasEmitidas]);

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
    if (!remetenteInicializado) {
      void loadRemetentePadrao();
    }
  }, [loadRemetentePadrao, remetenteInicializado]);

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
    void loadEtiquetasEmitidas();
  }, [loadEtiquetasEmitidas]);

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

    const rastreioExistente = etiquetaCodigoRastreio.trim();
    if (!forceNova && rastreioExistente) {
      const confirmed = window.confirm(
        `Este pedido já possui uma etiqueta emitida (código: ${rastreioExistente}). Deseja gerar uma nova mesmo assim?`,
      );
      if (!confirmed) return;
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
        itensDeclaracaoConteudo: declaracaoItens,
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
      setDeclaracaoItens([emptyDeclaracaoItem()]);
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

  const resolvePrePostagemIdEmEdicao = (): string | null => {
    if (editingEtiquetaId) {
      const match = etiquetasEmitidas.find((e) => e.id === editingEtiquetaId);
      if (match?.prePostagemId?.trim()) return match.prePostagemId.trim();
    }
    const codigo = etiquetaCodigoRastreio.trim();
    if (codigo) {
      const match = etiquetasEmitidas.find(
        (e) => e.codigoRastreio.replace(/\s/g, '').toUpperCase() === codigo.replace(/\s/g, '').toUpperCase(),
      );
      if (match?.prePostagemId?.trim()) return match.prePostagemId.trim();
    }
    return null;
  };

  const handleEmitirDeclaracaoConteudo = async (row?: CorreiosEtiquetaDto) => {
    const prePostagemId = row?.prePostagemId?.trim() || resolvePrePostagemIdEmEdicao();
    if (!prePostagemId) {
      setEtiquetaErro(
        'Selecione/edite uma etiqueta emitida para gerar a Declaração de Conteúdo.',
      );
      return;
    }

    if (row) setEtiquetaAcaoId(row.id);
    else setGerandoEtiqueta(true);
    setEtiquetaErro(null);
    try {
      await emitirDeclaracaoConteudoCorreios(prePostagemId);
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error
          ? error.message
          : 'Falha ao emitir Declaração de Conteúdo.',
      );
    } finally {
      setEtiquetaAcaoId(null);
      setGerandoEtiqueta(false);
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
    const confirmed = window.confirm(
      'Remover esta etiqueta apenas do sistema?\n\nNão chama a API dos Correios — use para registros duplicados ou já cancelados lá.',
    );
    if (!confirmed) return;

    setEtiquetaAcaoId(row.id);
    setEtiquetaErro(null);
    try {
      await excluirEtiquetaCorreios(row.id);
      await loadEtiquetasEmitidas();
    } catch (error) {
      setEtiquetaErro(
        error instanceof Error ? error.message : 'Falha ao remover etiqueta.',
      );
    } finally {
      setEtiquetaAcaoId(null);
    }
  };

  return (
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

        {!isAtualizarEtiquetaMode ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Declaração de Conteúdo (opcional)
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Preencha para registrar os itens na pré-postagem. A impressão da
                  declaração fica disponível depois, na lista de etiquetas.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDeclaracaoItens((prev) => [...prev, emptyDeclaracaoItem()])
                }
                className="inline-flex h-9 items-center justify-center rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                + Adicionar item
              </button>
            </div>
            <div className="space-y-3">
              {declaracaoItens.map((item, index) => (
                <div
                  key={`decl-item-${index}`}
                  className="grid gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] p-3 md:grid-cols-12"
                >
                  <label className="block text-sm md:col-span-4">
                    <span className="mb-1 block text-[var(--text-secondary)]">
                      Descrição do item
                    </span>
                    <input
                      value={item.conteudo}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDeclaracaoItens((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, conteudo: value } : row,
                          ),
                        );
                      }}
                      placeholder="Mín. 5 caracteres"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--text-secondary)]">Qtd.</span>
                    <input
                      type="number"
                      min={1}
                      value={item.quantidade}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDeclaracaoItens((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? withAutoValorDeclarado(row, { quantidade: value })
                              : row,
                          ),
                        );
                      }}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <label className="block text-sm md:col-span-2">
                    <span className="mb-1 block text-[var(--text-secondary)]">
                      Custo unitário (R$)
                    </span>
                    <input
                      value={item.custoUnitario}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDeclaracaoItens((prev) =>
                          prev.map((row, i) =>
                            i === index
                              ? withAutoValorDeclarado(row, {
                                  custoUnitario: value,
                                })
                              : row,
                          ),
                        );
                      }}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <label className="block text-sm md:col-span-3">
                    <span className="mb-1 block text-[var(--text-secondary)]">
                      Valor declarado (R$)
                    </span>
                    <input
                      value={item.valor}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDeclaracaoItens((prev) =>
                          prev.map((row, i) =>
                            i === index ? { ...row, valor: value } : row,
                          ),
                        );
                      }}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </label>
                  <div className="flex items-end md:col-span-1">
                    <button
                      type="button"
                      disabled={declaracaoItens.length <= 1}
                      onClick={() =>
                        setDeclaracaoItens((prev) =>
                          prev.length <= 1
                            ? prev
                            : prev.filter((_, i) => i !== index),
                        )
                      }
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-40"
                      title="Remover item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
            <button
              type="button"
              disabled={gerandoEtiqueta || buscandoCep || buscandoCepRemetente || carregandoRemetente}
              onClick={() => void handleEmitirDeclaracaoConteudo()}
              className="inline-flex h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-60"
            >
              {gerandoEtiqueta ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageSearch className="h-4 w-4" />
              )}
              Emitir Declaração de Conteúdo
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
                                disabled={!isAtiva || acaoLoading || !row.prePostagemId}
                                onClick={() => void handleEmitirDeclaracaoConteudo(row)}
                                className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                              >
                                {acaoLoading ? '…' : 'Declaração de Conteúdo'}
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
                                title="Remover do sistema (sem chamar Correios)"
                                aria-label="Remover etiqueta do sistema"
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Remover do sistema
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
  );
}
