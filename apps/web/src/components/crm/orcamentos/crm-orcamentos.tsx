'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Filter, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { CrmOrcamentoCatalog } from '@/src/components/crm/orcamentos/crm-orcamento-catalog';
import { CrmOrcamentoEngraving } from '@/src/components/crm/orcamentos/crm-orcamento-engraving';
import { CrmOrcamentoDashboard } from '@/src/components/crm/orcamentos/crm-orcamento-dashboard';
import { CrmOrcamentoForm } from '@/src/components/crm/orcamentos/crm-orcamento-form';
import { EmptyState } from '@/src/components/ui/empty-state';
import type { CrmUserDto } from '@/src/services/api/crm-api';
import {
  deleteQuote,
  duplicateQuote,
  formatQuoteCurrency,
  getQuote,
  listQuotes,
  QUOTE_ORIGIN_LABEL,
  QUOTE_STATUS_BADGE_CLASS,
  QUOTE_STATUS_LABEL,
  type QuoteDto,
  type QuoteStatus,
} from '@/src/services/api/quotes-api';

type StatusTab = 'TODOS' | QuoteStatus;
type WorkspaceTab = 'lista' | 'catalogo' | 'dashboard' | 'gravacoes';

const STATUS_TABS: Array<{ id: StatusTab; label: string }> = [
  { id: 'TODOS', label: 'Todos' },
  { id: 'AGUARDANDO', label: 'Aguardando' },
  { id: 'NAO_APROVADO', label: 'Não Aprovado' },
  { id: 'APROVADO', label: 'Aprovado' },
  { id: 'PENDENTE_APROVACAO', label: 'Pendente' },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR');
}

export function CrmOrcamentos(props: {
  users: CrmUserDto[];
}) {
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('lista');
  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editing, setEditing] = useState<QuoteDto | null>(null);
  const [rows, setRows] = useState<QuoteDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusTab, setStatusTab] = useState<StatusTab>('TODOS');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const userNameById = useMemo(
    () => Object.fromEntries(props.users.map((u) => [u.id, u.name])),
    [props.users],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listQuotes({
        status: statusTab === 'TODOS' ? undefined : statusTab,
        search: search || undefined,
        page,
        pageSize,
      });
      if (signal?.aborted) return;
      setRows(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.totalPages);
      setSelected(new Set());
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Falha ao carregar orçamentos.');
      setRows([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, pageSize, search, statusTab]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setMode('form');
  };

  const openEdit = async (id: string) => {
    setError(null);
    try {
      const quote = await getQuote(id);
      setEditing(quote);
      setMode('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao abrir orçamento.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este orçamento?')) return;
    setError(null);
    try {
      await deleteQuote(id);
      setRefreshToken((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir orçamento.');
    }
  };

  const handleDuplicate = async (id: string) => {
    setError(null);
    try {
      const copy = await duplicateQuote(id);
      setEditing(copy);
      setMode('form');
      setRefreshToken((v) => v + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao duplicar orçamento.',
      );
    }
  };

  if (mode === 'form') {
    return (
      <CrmOrcamentoForm
        quote={editing}
        users={props.users}
        onBack={() => {
          setMode('list');
          setEditing(null);
          setWorkspaceTab('lista');
          setRefreshToken((v) => v + 1);
        }}
        onSaved={(quote) => {
          setEditing(quote);
          setRefreshToken((v) => v + 1);
        }}
        onDuplicated={(quote) => {
          setEditing(quote);
          setRefreshToken((v) => v + 1);
        }}
      />
    );
  }

  return (
    <section className="erp-module-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--erp-border)] px-3 pt-3">
        <button
          type="button"
          onClick={() => setWorkspaceTab('lista')}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold ${
            workspaceTab === 'lista'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Orçamentos
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('dashboard')}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold ${
            workspaceTab === 'dashboard'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('catalogo')}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold ${
            workspaceTab === 'catalogo'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Catálogo
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceTab('gravacoes')}
          className={`erp-focus-ring rounded-t-lg px-3 py-2 text-sm font-semibold ${
            workspaceTab === 'gravacoes'
              ? 'bg-white text-[#2AACE2] shadow-sm'
              : 'text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
          }`}
        >
          Gravações
        </button>
      </div>

      {workspaceTab === 'dashboard' ? <CrmOrcamentoDashboard /> : null}
      {workspaceTab === 'catalogo' ? <CrmOrcamentoCatalog /> : null}
      {workspaceTab === 'gravacoes' ? <CrmOrcamentoEngraving /> : null}

      {workspaceTab === 'lista' ? (
        <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--erp-border)] p-3">
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((tab) => {
            const active = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusTab(tab.id);
                  setPage(1);
                }}
                className={`erp-focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-[#2AACE2] text-white'
                    : 'bg-[var(--erp-bg)] text-[var(--erp-fg-muted)] hover:text-[var(--erp-fg)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative min-w-[min(100%,14rem)] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-fg-muted)]" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(searchInput.trim());
                setPage(1);
              }
            }}
            placeholder="Buscar por nome ou código..."
            className="erp-module-input pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setSearch(searchInput.trim());
            setPage(1);
          }}
          className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
        >
          <Filter className="erp-icon-sm" aria-hidden />
          Filtrar
        </button>
        <button
          type="button"
          onClick={openCreate}
          className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md"
        >
          <Plus className="erp-icon-sm" aria-hidden />
          Cadastrar Orçamento
        </button>
      </div>

      {error ? <div className="erp-alert-danger mx-3 mt-3 shrink-0">{error}</div> : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[var(--erp-fg-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando orçamentos...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nenhum orçamento"
            description="Cadastre o primeiro orçamento para começar."
          />
        ) : (
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--erp-bg)] text-xs uppercase tracking-wide text-[var(--erp-fg-muted)]">
              <tr className="border-b border-[var(--erp-border)]">
                <th className="px-3 py-2.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Selecionar todos"
                  />
                </th>
                <th className="px-3 py-2.5 font-semibold">Código</th>
                <th className="px-3 py-2.5 font-semibold">Data solicitação</th>
                <th className="px-3 py-2.5 font-semibold">Nome empresa</th>
                <th className="px-3 py-2.5 font-semibold">Contato</th>
                <th className="px-3 py-2.5 font-semibold">Pedido vinculado</th>
                <th className="px-3 py-2.5 font-semibold">Total</th>
                <th className="px-3 py-2.5 font-semibold">Responsável</th>
                <th className="px-3 py-2.5 font-semibold">Origem</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openEdit(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void openEdit(row.id);
                    }
                  }}
                  className="cursor-pointer border-b border-[var(--erp-border)]/70 hover:bg-[var(--erp-bg-hover)]"
                >
                  <td
                    className="px-3 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={(e) => toggleOne(row.id, e.target.checked)}
                      aria-label={`Selecionar ${row.code}`}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-[#2AACE2]">{row.code}</td>
                  <td className="px-3 py-2.5">{formatDate(row.requestDate)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--erp-fg)]">{row.customerName}</div>
                    {row.billingCompany ? (
                      <div className="text-xs text-[var(--erp-fg-muted)]">
                        {row.billingCompany}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--erp-fg-muted)]">
                    {row.customerEmail || row.customerPhone || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.linkedOrderId || row.customerOrderRef || '—'}
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    {formatQuoteCurrency(row.total)}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.responsibleUserId
                      ? userNameById[row.responsibleUserId] ?? '—'
                      : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {QUOTE_ORIGIN_LABEL[row.origin] ?? row.origin}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        QUOTE_STATUS_BADGE_CLASS[row.status] ??
                        'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {QUOTE_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td
                    className="px-3 py-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(row.id)}
                        className="erp-focus-ring rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-white hover:text-[#2AACE2]"
                        title="Duplicar"
                        aria-label={`Duplicar ${row.code}`}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row.id)}
                        className="erp-focus-ring rounded-md p-1.5 text-[var(--erp-fg-muted)] hover:bg-white hover:text-rose-600"
                        title="Excluir"
                        aria-label={`Excluir ${row.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--erp-border)] px-3 py-2.5 text-xs text-[var(--erp-fg-muted)]">
        <span>
          {total} orçamento{total === 1 ? '' : 's'} · página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--sm disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="erp-focus-ring erp-btn erp-btn-ghost erp-btn--sm disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
        </>
      ) : null}
    </section>
  );
}
