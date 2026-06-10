'use client';

import { useEffect, useMemo, useState } from 'react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

const TRANSPORTADORAS_POR_CNPJ: Record<string, string> = {
  '07175725004238': 'JADLOG',
  '10885321000174': 'JADLOG',
  '07175725004319': 'JADLOG',
  '07175725001484': 'EXPRESSO SAO MIGUEL',
  '07175725001050': 'EXPRESSO SAO MIGUEL',
  '14309992000148': 'EXPRESSO SAO MIGUEL',
  '84584994000716': 'EXPRESSO SAO MIGUEL',
  '07175725001212': 'EXPRESSO SAO MIGUEL',
  '60621141000404': 'EXPRESSO SAO MIGUEL',
  '14309992000229': 'EXPRESSO SAO MIGUEL',
};

function transportadoraFixaPorCnpj(cnpj?: string | null): string | null {
  if (!cnpj) return null;
  const limpo = cnpj.replace(/\D/g, '');
  return TRANSPORTADORAS_POR_CNPJ[limpo] ?? null;
}

export function GerarNfModal(props: {
  orderNumber: string;
  deliveryCnpj?: string | null;
  totalValueLabel: string;
  issueDateLabel: string;
  onCancel: () => void;
  onQueued: (result: { jobId: string; posicaoNaFila: number }) => void | Promise<void>;
}) {
  const { orderNumber, deliveryCnpj, totalValueLabel, issueDateLabel, onCancel, onQueued } =
    props;
  const [step, setStep] = useState<1 | 2>(1);
  const [volume, setVolume] = useState('');
  const [transportadoras, setTransportadoras] = useState<string[]>([]);
  const [transportadora, setTransportadora] = useState('');
  const [carregandoTransportadoras, setCarregandoTransportadoras] = useState(true);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [fase, setFase] = useState<'config' | 'confirm' | 'loading' | 'error'>(
    'config',
  );

  const transportadoraFixa = useMemo(
    () => transportadoraFixaPorCnpj(deliveryCnpj),
    [deliveryCnpj],
  );
  const transportadoraSelecionada = transportadoraFixa ?? transportadora;
  const volumeSanitizado = useMemo(() => volume.replace(/\D/g, ''), [volume]);
  const podeIrParaConfirmacao =
    !!transportadoraSelecionada && !carregandoTransportadoras;

  useEffect(() => {
    let ativo = true;
    const carregarTransportadoras = async () => {
      setCarregandoTransportadoras(true);
      try {
        const data = await erpFetchJson<string[]>('pedidos/transportadoras');
        if (!ativo) return;
        setTransportadoras(Array.isArray(data) ? data : []);
      } catch {
        if (!ativo) return;
        setTransportadoras(['EXPRESSO SAO MIGUEL', 'JADLOG']);
      } finally {
        if (ativo) setCarregandoTransportadoras(false);
      }
    };
    void carregarTransportadoras();
    return () => {
      ativo = false;
    };
  }, []);

  async function confirmarEmissao() {
    setLoading(true);
    setErro('');
    setFase('loading');

    try {
      const data = await erpFetchJson<{
        jobId: string;
        status: string;
        posicaoNaFila: number;
        message?: string;
        erro?: string;
      }>(`pedidos/${orderNumber}/gerar-nf-fila`, {
        method: 'POST',
        body: JSON.stringify({
          volume: volumeSanitizado || undefined,
          transportadora: transportadoraSelecionada || undefined,
        }),
      });
      if (!data?.jobId) {
        throw new Error(data?.message || data?.erro || 'Falha ao adicionar pedido na fila.');
      }
      localStorage.setItem('nfQueue:lastJobId', data.jobId);
      await onQueued({ jobId: data.jobId, posicaoNaFila: data.posicaoNaFila ?? 1 });
      onCancel();
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Erro inesperado ao emitir nota fiscal.';
      setErro(message);
      setFase('error');
    } finally {
      setLoading(false);
    }
  }

  const bloquearFechamento = fase === 'loading';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Emitir nota fiscal</h3>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-sm text-[var(--text-secondary)] hover:bg-[var(--input-bg)]"
            onClick={onCancel}
            disabled={bloquearFechamento}
          >
            X
          </button>
        </div>

        {fase === 'config' && step === 1 ? (
          <>
            <div className="mt-4 space-y-1 text-sm">
              <p className="text-[var(--text-primary)]">Pedido #{orderNumber}</p>
              <p className="text-[var(--text-secondary)]">Valor: {totalValueLabel}</p>
              <p className="text-[var(--text-secondary)]">Data de emissão: {issueDateLabel}</p>
            </div>

            <label className="mt-4 block text-sm text-[var(--text-primary)]">
              Volume (caixas)
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="Ex: 3"
                className="mt-1 h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </label>

            <div className="mt-4">
              <p className="text-sm text-[var(--text-primary)]">Transportadora</p>
              {transportadoraFixa ? (
                <div className="mt-1 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-3 text-sm text-[var(--text-primary)]">
                  {transportadoraFixa}
                </div>
              ) : (
                <select
                  value={transportadora}
                  onChange={(e) => setTransportadora(e.target.value)}
                  disabled={carregandoTransportadoras}
                  className="mt-1 h-11 w-full rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] outline-none"
                >
                  <option value="">
                    {carregandoTransportadoras
                      ? 'Carregando transportadoras...'
                      : 'Selecione uma transportadora'}
                  </option>
                  {transportadoras.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        ) : null}

        {fase === 'confirm' && step === 2 ? (
          <div className="mt-4 space-y-1 text-sm">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">Confirmar emissão</h4>
            <p className="text-[var(--text-primary)]">Pedido #{orderNumber}</p>
            <p className="text-[var(--text-secondary)]">
              Transportadora: {transportadoraSelecionada}
            </p>
            <p className="text-[var(--text-secondary)]">
              Volume: {volumeSanitizado || 'não informado'}
            </p>
            <p className="text-[var(--text-secondary)]">Valor: {totalValueLabel}</p>
          </div>
        ) : null}

        {fase === 'loading' ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-4 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-[var(--accent)]" />
            <p className="text-sm text-[var(--text-primary)]">
              Abrindo Conta Azul... aguarde ~1-2 minutos
            </p>
          </div>
        ) : null}

        {fase === 'error' ? (
          <div className="mt-6 space-y-2 text-center">
            <p className="text-3xl text-red-500">✗</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Erro ao emitir nota fiscal
            </p>
            <p className="text-xs text-[var(--text-secondary)]">{erro}</p>
          </div>
        ) : null}

        {fase === 'config' || fase === 'confirm' ? (
          <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] p-3 text-xs text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              O Conta Azul será aberto automaticamente e a nota será preenchida.
            </p>
            <p className="mt-2">Isso leva aproximadamente 1-2 minutos.</p>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {fase === 'config' && step === 1 ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                onClick={onCancel}
                disabled={bloquearFechamento}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!podeIrParaConfirmacao}
                onClick={() => {
                  setStep(2);
                  setFase('confirm');
                }}
              >
                Gerar NF automaticamente →
              </button>
            </>
          ) : null}

          {fase === 'confirm' && step === 2 ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                onClick={() => {
                  setStep(1);
                  setFase('config');
                }}
                disabled={loading}
              >
                ← Voltar
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={loading}
                onClick={() => void confirmarEmissao()}
              >
                Confirmar e emitir
              </button>
            </>
          ) : null}

          {fase === 'error' ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]"
                onClick={() => {
                  setStep(1);
                  setFase('config');
                  setErro('');
                }}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white"
                onClick={onCancel}
              >
                Fechar
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

