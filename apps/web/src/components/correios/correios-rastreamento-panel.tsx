'use client';

import { useMemo, useState } from 'react';
import { Loader2, PackageSearch, Search, Tag } from 'lucide-react';
import {
  type CorreiosTrackingEvent,
  baixarComprovanteEntrega,
  isCorreiosObjetoEntregue,
  rastrearCorreios,
} from '@/src/services/api/correios-api';

export function CorreiosRastreamentoPanel() {
  const [codigoRastreio, setCodigoRastreio] = useState('');
  const [rastreando, setRastreando] = useState(false);
  const [rastreioErro, setRastreioErro] = useState<string | null>(null);
  const [rastreioEventos, setRastreioEventos] = useState<CorreiosTrackingEvent[]>([]);
  const [rastreioCodigoAtual, setRastreioCodigoAtual] = useState('');
  const [baixandoComprovante, setBaixandoComprovante] = useState(false);

  const objetoEntregue = useMemo(
    () => isCorreiosObjetoEntregue(rastreioEventos),
    [rastreioEventos],
  );

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

  return (
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
  );
}
