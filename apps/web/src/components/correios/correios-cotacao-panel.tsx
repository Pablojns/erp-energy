'use client';

import { useMemo, useState } from 'react';
import { Loader2, Search, Truck } from 'lucide-react';
import { type CorreiosServiceId, cotarCorreios } from '@/src/services/api/correios-api';
import {
  COTACAO_SERVICES,
  DEFAULT_CEP_ORIGEM,
  formatCepInput,
} from '@/src/components/correios/correios-helpers';

export function CorreiosCotacaoPanel() {
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

  const servicoSelecionado = useMemo(
    () => COTACAO_SERVICES.find((s) => s.id === servico) ?? COTACAO_SERVICES[0],
    [servico],
  );

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

  return (
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
  );
}
