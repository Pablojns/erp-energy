'use client';

import { useCallback, useEffect, useState } from 'react';
import { FinTableSkeleton } from '@/src/components/financeiro/skeletons';
import type {
  ContasAtrasoResponse,
  ContaAtrasoGrupo,
  ContaAtrasoTone,
  ReconciliacaoEstoqueResponse,
} from '@/src/components/financeiro/types';
import { formatCurrency, formatDateBr } from '@/src/components/financeiro/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

function toneClass(tone: ContaAtrasoTone): string {
  if (tone === 'critico') return 'text-[var(--fin-danger-deep)]';
  if (tone === 'atencao') return 'text-[var(--fin-warning)]';
  return 'text-[var(--fin-text)]';
}

function toneRowClass(tone: ContaAtrasoTone): string {
  if (tone === 'critico') {
    return 'bg-[color-mix(in_srgb,var(--fin-danger-deep)_8%,transparent)]';
  }
  if (tone === 'atencao') {
    return 'bg-[color-mix(in_srgb,var(--fin-warning)_8%,transparent)]';
  }
  return '';
}

function ToneBadge(props: { tone: ContaAtrasoTone; dias: number }) {
  const label =
    props.tone === 'critico'
      ? 'Crítico'
      : props.tone === 'atencao'
        ? 'Atenção'
        : 'Em atraso';
  return (
    <span className={`text-xs font-semibold tabular-nums ${toneClass(props.tone)}`}>
      {props.dias}d · {label}
    </span>
  );
}

export function FinanceiroAtrasoTab(props: { refreshToken: number }) {
  const { refreshToken } = props;
  const [data, setData] = useState<ContasAtrasoResponse | null>(null);
  const [gaps, setGaps] = useState<ReconciliacaoEstoqueResponse | null>(null);
  const [openCnpj, setOpenCnpj] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [atraso, recon] = await Promise.all([
        erpFetchJson<ContasAtrasoResponse>('api/financeiro/contas-atraso'),
        erpFetchJson<ReconciliacaoEstoqueResponse>(
          'api/financeiro/reconciliacao-estoque',
        ),
      ]);
      setData(atraso);
      setGaps(recon);
    } catch (e) {
      setData(null);
      setGaps(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar atrasos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  if (loading) {
    return <FinTableSkeleton rows={8} />;
  }

  const grupos = data?.grupos ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {error ? (
        <p className="shrink-0 text-sm text-[var(--fin-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-[var(--fin-text)]">
            Contas a receber em atraso
          </h2>
          <p className="mt-0.5 text-xs text-[var(--fin-text-muted)]">
            Agrupado por CNPJ do comprador · vencimento = emissão + 12 dias · vermelho
            &gt; 30d, amarelo 7–30d
          </p>
        </div>
        <p className="text-xs text-[var(--fin-text-muted)]">
          {data?.totalClientes ?? 0} CNPJ(s) · {data?.totalTitulos ?? 0} nota(s) ·{' '}
          {formatCurrency(data?.valorTotal ?? 0)}
        </p>
      </div>

      <div className="fin-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <div className="lista-container erp-scrollbar overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-xs sm:text-sm">
            <thead
              className="sticky top-0 z-[1] text-[10px] font-semibold uppercase tracking-wider text-[var(--fin-text-muted)]"
              style={{ background: 'var(--fin-card-muted)' }}
            >
              <tr className="border-b" style={{ borderColor: 'var(--fin-border)' }}>
                <th className="px-4 py-3">CNPJ do comprador</th>
                <th className="px-4 py-3 text-center">Notas</th>
                <th className="px-4 py-3">Valor total</th>
                <th className="px-4 py-3">Atraso mais antigo</th>
              </tr>
            </thead>
            <tbody>
              {grupos.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-12 text-center text-[var(--fin-text-muted)]"
                  >
                    Nenhum título em atraso.
                  </td>
                </tr>
              ) : (
                grupos.map((g) => (
                  <GrupoRows
                    key={g.cnpjKey}
                    grupo={g}
                    open={openCnpj === g.cnpjKey}
                    onToggle={() =>
                      setOpenCnpj((cur) => (cur === g.cnpjKey ? null : g.cnpjKey))
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fin-card shrink-0 rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[var(--fin-text)]">
          Reconciliação de estoque (pedidos FINALIZADO)
        </h3>
        <p className="mt-1 text-xs text-[var(--fin-text-muted)]">
          Auditoria interna: pedidos já finalizados sem movimentação SAIDA_EXPEDICAO
          correspondente. Títulos em atraso passam a usar a Conta Azul quando a
          sincronização já rodou.
        </p>
        {(gaps?.total ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-[var(--fin-success)]">
            Nenhuma divergência encontrada.
          </p>
        ) : (
          <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-xs">
            {gaps?.gaps.map((g) => (
              <li key={g.orderId} className="text-[var(--fin-danger)]">
                Pedido {g.pedido}
                {g.invoiceNumber ? ` · NF ${g.invoiceNumber}` : ''} — {g.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GrupoRows(props: {
  grupo: ContaAtrasoGrupo;
  open: boolean;
  onToggle: () => void;
}) {
  const { grupo, open, onToggle } = props;
  return (
    <>
      <tr
        className={`cursor-pointer border-b transition hover:bg-[var(--fin-card-muted)] ${toneRowClass(grupo.tone)}`}
        style={{ borderColor: 'var(--fin-border)' }}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-[var(--fin-text)]">
          <div className="font-semibold">CNPJ: {grupo.cnpj}</div>
          <div className="mt-0.5 text-[11px] font-normal text-[var(--fin-text-muted)]">
            {grupo.titulos} nota{grupo.titulos === 1 ? '' : 's'} em atraso · Valor
            total: {formatCurrency(grupo.valorTotal)} · Atraso mais antigo:{' '}
            {grupo.diasAtrasoMaisAntigo} dias
          </div>
        </td>
        <td className="px-4 py-3 text-center tabular-nums">{grupo.titulos}</td>
        <td className="px-4 py-3 font-semibold tabular-nums">
          {formatCurrency(grupo.valorTotal)}
        </td>
        <td className="px-4 py-3">
          <ToneBadge tone={grupo.tone} dias={grupo.diasAtrasoMaisAntigo} />
        </td>
      </tr>
      {open
        ? grupo.itens.map((it) => (
            <tr
              key={it.id}
              className="border-b"
              style={{ borderColor: 'var(--fin-border)' }}
            >
              <td className="px-4 py-2 pl-8 text-[var(--fin-text-secondary)]">
                Nota {it.invoiceNumber} · pedido #{it.pedido} · emissão{' '}
                {formatDateBr(it.dataEmissao)}
              </td>
              <td className="px-4 py-2 text-center text-[var(--fin-text-muted)]">
                —
              </td>
              <td className="px-4 py-2 tabular-nums">{formatCurrency(it.valor)}</td>
              <td className="px-4 py-2">
                <span className={`text-xs font-semibold ${toneClass(it.tone)}`}>
                  {it.diasAtraso}d
                </span>
              </td>
            </tr>
          ))
        : null}
    </>
  );
}

export function contasAtrasoToCsvRows(grupos: ContaAtrasoGrupo[]): string[][] {
  return grupos.map((g) => [
    g.cnpj,
    String(g.titulos),
    String(g.valorTotal),
    String(g.diasAtrasoMaisAntigo),
    g.tone,
  ]);
}

export const ATRASO_CSV_HEADERS = [
  'CNPJ',
  'Notas em atraso',
  'Valor total',
  'Dias atraso (mais antigo)',
  'Severidade',
];
