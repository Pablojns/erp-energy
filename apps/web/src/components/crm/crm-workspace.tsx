'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns3, List, MoreVertical, Plus, Search } from 'lucide-react';
import { CrmCardDetailModal } from '@/src/components/crm/crm-card-detail-modal';
import { CrmClientesList } from '@/src/components/crm/crm-clientes-list';
import { CrmCreateCardModal } from '@/src/components/crm/crm-create-card-modal';
import { CrmCreateFunilModal } from '@/src/components/crm/crm-create-funil-modal';
import { CrmDashboard } from '@/src/components/crm/crm-dashboard';
import { CrmKanbanBoard } from '@/src/components/crm/crm-kanban-board';
import { CrmKanbanListView } from '@/src/components/crm/crm-kanban-list-view';
import { CrmMetasModal } from '@/src/components/crm/crm-metas-modal';
import { CrmOrcamentos } from '@/src/components/crm/orcamentos/crm-orcamentos';
import { CrmRelatorios } from '@/src/components/crm/crm-relatorios';
import { CrmSettingsModal } from '@/src/components/crm/crm-settings-modal';
import { CrmMobileNav, CrmSidebar, type CrmView } from '@/src/components/crm/crm-sidebar';
import { MobileBottomDrawer } from '@/src/components/mobile/mobile-bottom-drawer';
import type { CrmDashboardPeriod } from '@/src/components/crm/crm-helpers';
import { cardMatchesEntryDateRange } from '@/src/components/crm/crm-helpers';
import {
  getCrmDashboard,
  listCrmCards,
  listCrmChannels,
  listCrmFunis,
  listCrmStatuses,
  listCrmUsuarios,
  type CrmCardDto,
  type CrmCardOrigin,
  type CrmChannelDto,
  type CrmDashboardDto,
  type CrmFunilDto,
  type CrmStatusDto,
  type CrmUserDto,
} from '@/src/services/api/crm-api';
import { listQuotes } from '@/src/services/api/quotes-api';

function normalizeKanbanQuoteSearch(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutLabel = trimmed
    .replace(/^(or[cç]amento|orc)\s*/i, '')
    .trim();
  if (/^ORC-/i.test(withoutLabel)) return withoutLabel;
  const digits = withoutLabel.replace(/\D/g, '');
  if (digits.length > 0 && digits.length <= 8 && /^[\d\s-]+$/i.test(withoutLabel)) {
    return `ORC-${digits.padStart(2, '0')}`;
  }
  if (/or[cç]amento/i.test(trimmed) && digits.length > 0) {
    return `ORC-${digits.padStart(2, '0')}`;
  }
  return null;
}

const VIEW_TITLE: Record<Exclude<CrmView, 'relatorios'>, string> = {
  dashboard: 'Dashboard',
  kanban: 'Kanban',
  clientes: 'Clientes',
  orcamentos: 'Orçamentos',
};

export function CrmWorkspace(props: { isAdmin?: boolean }) {
  const isAdmin = props.isAdmin ?? false;
  const [activeView, setActiveView] = useState<CrmView>('dashboard');
  const [funis, setFunis] = useState<CrmFunilDto[]>([]);
  const [statuses, setStatuses] = useState<CrmStatusDto[]>([]);
  const [channels, setChannels] = useState<CrmChannelDto[]>([]);
  const [users, setUsers] = useState<CrmUserDto[]>([]);
  const [cards, setCards] = useState<CrmCardDto[]>([]);
  const [dashboard, setDashboard] = useState<CrmDashboardDto | null>(null);
  const [originFilter, setOriginFilter] = useState<CrmCardOrigin | 'TODOS'>('TODOS');
  const [periodFilter, setPeriodFilter] = useState<CrmDashboardPeriod>('30d');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [funilModalOpen, setFunilModalOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [metasModalOpen, setMetasModalOpen] = useState(false);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [kanbanLayout, setKanbanLayout] = useState<'kanban' | 'list'>('kanban');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [kanbanSearch, setKanbanSearch] = useState('');
  const [kanbanEntryDateFrom, setKanbanEntryDateFrom] = useState('');
  const [kanbanEntryDateTo, setKanbanEntryDateTo] = useState('');
  const [quoteMatchCardIds, setQuoteMatchCardIds] = useState<Set<string>>(
    () => new Set(),
  );

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoadingData(true);
      setError(null);
      try {
        const [funisData, cardsData, statusesData, channelsData, usersData] =
          await Promise.all([
          listCrmFunis(),
          listCrmCards(),
          listCrmStatuses(),
          listCrmChannels(),
          listCrmUsuarios(),
        ]);
        if (!controller.signal.aborted) {
          setFunis(funisData);
          setCards(cardsData);
          setStatuses(statusesData);
          setChannels(channelsData);
          setUsers(usersData);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar CRM.');
          setFunis([]);
          setCards([]);
          setStatuses([]);
          setChannels([]);
          setUsers([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingData(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [refreshToken]);

  useEffect(() => {
    if (activeView !== 'dashboard') return;

    const controller = new AbortController();
    const load = async () => {
      setLoadingDashboard(true);
      try {
        const data = await getCrmDashboard(originFilter, periodFilter);
        if (!controller.signal.aborted) setDashboard(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setDashboard(null);
          setError(err instanceof Error ? err.message : 'Falha ao carregar dashboard.');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingDashboard(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [activeView, originFilter, periodFilter, refreshToken]);

  const handleCardMoved = (updated: CrmCardDto) => {
    setCards((current) => {
      const index = current.findIndex((row) => row.id === updated.id);
      if (index === -1) return [...current, updated];
      const next = [...current];
      next[index] = updated;
      return next;
    });
  };

  const handleDataChanged = async () => {
    refresh();
  };

  useEffect(() => {
    if (activeView !== 'kanban') return;
    const q = kanbanSearch.trim();
    const codeHint = normalizeKanbanQuoteSearch(q);
    if (!q || !codeHint) {
      setQuoteMatchCardIds(new Set());
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void listQuotes({ search: codeHint, pageSize: 20 })
        .then((res) => {
          if (controller.signal.aborted) return;
          const exact = res.data.filter(
            (quote) => quote.code.toUpperCase() === codeHint.toUpperCase(),
          );
          const pool = exact.length > 0 ? exact : res.data;
          const ids = new Set(
            pool
              .map((quote) => quote.linkedCrmCardId)
              .filter((id): id is string => Boolean(id)),
          );
          setQuoteMatchCardIds(ids);
          if (exact.length === 1 && exact[0]?.linkedCrmCardId) {
            setDetailCardId(exact[0].linkedCrmCardId);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setQuoteMatchCardIds(new Set());
        });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeView, kanbanSearch]);

  const filteredKanbanCards = useMemo(() => {
    const q = kanbanSearch.trim().toLowerCase();
    return cards.filter((card) => {
      if (!cardMatchesEntryDateRange(card, kanbanEntryDateFrom, kanbanEntryDateTo)) {
        return false;
      }
      if (!q) return true;
      if (quoteMatchCardIds.has(card.id)) return true;
      const haystack = [card.name, card.phone, card.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    cards,
    kanbanEntryDateFrom,
    kanbanEntryDateTo,
    kanbanSearch,
    quoteMatchCardIds,
  ]);

  const showKanbanActions = activeView === 'kanban';
  const showNewLeadAction = activeView === 'kanban' || activeView === 'clientes';
  const viewTitle =
    activeView !== 'relatorios' ? VIEW_TITLE[activeView] : 'Relatórios';

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-0 overflow-hidden">
      <CrmSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-[var(--erp-bg)]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--erp-border)] px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="erp-focus-ring -ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--erp-fg)] md:hidden"
              aria-label="Abrir menu do CRM"
            >
              <MoreVertical className="h-5 w-5" aria-hidden />
            </button>
            <h2 className="truncate text-lg font-semibold text-[var(--erp-fg)]">{viewTitle}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showKanbanActions ? (
              <>
                <div className="inline-flex rounded-lg border border-[var(--erp-border)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setKanbanLayout('kanban')}
                    className={`erp-focus-ring erp-btn erp-btn--sm rounded-md px-2.5 ${
                      kanbanLayout === 'kanban'
                        ? 'erp-btn-primary'
                        : 'erp-btn-ghost text-[var(--erp-fg-muted)]'
                    }`}
                    aria-label="Visão Kanban"
                    title="Kanban"
                  >
                    <Columns3 className="erp-icon-sm" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setKanbanLayout('list')}
                    className={`erp-focus-ring erp-btn erp-btn--sm rounded-md px-2.5 ${
                      kanbanLayout === 'list'
                        ? 'erp-btn-primary'
                        : 'erp-btn-ghost text-[var(--erp-fg-muted)]'
                    }`}
                    aria-label="Visão lista"
                    title="Lista"
                  >
                    <List className="erp-icon-sm" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFunilModalOpen(true)}
                  className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
                >
                  Criar funil
                </button>
              </>
            ) : null}
            {showNewLeadAction ? (
              <button
                type="button"
                onClick={() => setCardModalOpen(true)}
                disabled={funis.length === 0}
                className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
              >
                <Plus className="erp-icon-sm" aria-hidden />
                Novo lead
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="erp-alert-danger mx-4 mt-3 shrink-0 sm:mx-5">{error}</div>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5">
          {activeView === 'dashboard' ? (
            <CrmDashboard
              data={dashboard}
              loading={loadingDashboard}
              originFilter={originFilter}
              periodFilter={periodFilter}
              isAdmin={isAdmin}
              onOriginFilterChange={setOriginFilter}
              onPeriodFilterChange={setPeriodFilter}
              onEditMetas={() => setMetasModalOpen(true)}
            />
          ) : null}

          {activeView === 'kanban' ? (
            <section className="erp-module-panel relative flex min-h-0 flex-1 flex-col overflow-hidden p-3">
              <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3">
                <div className="relative min-w-[min(100%,14rem)] flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-fg-muted)]" />
                  <input
                    value={kanbanSearch}
                    onChange={(e) => setKanbanSearch(e.target.value)}
                    placeholder="Buscar lead ou orçamento (ex: ORC-30, orçamento 30)..."
                    className="erp-module-input pl-9"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-[var(--erp-fg-muted)]">
                  De
                  <input
                    type="date"
                    value={kanbanEntryDateFrom}
                    onChange={(e) => setKanbanEntryDateFrom(e.target.value)}
                    className="erp-module-input w-auto"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[var(--erp-fg-muted)]">
                  Até
                  <input
                    type="date"
                    value={kanbanEntryDateTo}
                    onChange={(e) => setKanbanEntryDateTo(e.target.value)}
                    className="erp-module-input w-auto"
                  />
                </label>
              </div>
              {kanbanLayout === 'kanban' ? (
                <CrmKanbanBoard
                  funis={funis}
                  cards={filteredKanbanCards}
                  highlightedCardIds={quoteMatchCardIds}
                  loading={loadingData}
                  onOpenCard={(card) => setDetailCardId(card.id)}
                  onCardMoved={handleCardMoved}
                  onError={setError}
                />
              ) : (
                <CrmKanbanListView
                  cards={filteredKanbanCards}
                  funis={funis}
                  statuses={statuses}
                  users={users}
                  loading={loadingData}
                  onOpenCard={(card) => setDetailCardId(card.id)}
                />
              )}
              {showNewLeadAction && kanbanLayout === 'kanban' ? (
                <button
                  type="button"
                  className="erp-mobile-kanban-fab md:hidden"
                  aria-label="Novo lead"
                  disabled={funis.length === 0}
                  onClick={() => setCardModalOpen(true)}
                >
                  <Plus className="h-6 w-6" />
                </button>
              ) : null}
            </section>
          ) : null}

          {activeView === 'clientes' ? (
            <CrmClientesList
              cards={cards}
              funis={funis}
              statuses={statuses}
              users={users}
              loading={loadingData}
              onOpenCard={(card) => setDetailCardId(card.id)}
              onImported={handleDataChanged}
            />
          ) : null}

          {activeView === 'orcamentos' ? <CrmOrcamentos users={users} /> : null}

          {activeView === 'relatorios' ? <CrmRelatorios /> : null}
        </div>
      </div>

      <MobileBottomDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        title="Menu CRM"
      >
        <CrmMobileNav
          activeView={activeView}
          onViewChange={(view) => {
            setActiveView(view);
            setMobileNavOpen(false);
          }}
          onOpenSettings={() => {
            setMobileNavOpen(false);
            setSettingsOpen(true);
          }}
        />
      </MobileBottomDrawer>

      <CrmCreateFunilModal
        open={funilModalOpen}
        onClose={() => setFunilModalOpen(false)}
        onCreated={refresh}
      />

      <CrmCreateCardModal
        open={cardModalOpen}
        funis={funis}
        onClose={() => setCardModalOpen(false)}
        onCreated={refresh}
        onViewExisting={(card) => setDetailCardId(card.id)}
      />

      <CrmSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={refresh}
      />

      <CrmMetasModal
        open={metasModalOpen}
        initial={dashboard?.metasMes ?? null}
        onClose={() => setMetasModalOpen(false)}
        onSaved={handleDataChanged}
      />

      <CrmCardDetailModal
        cardId={detailCardId}
        funis={funis}
        statuses={statuses}
        channels={channels}
        users={users}
        onClose={() => setDetailCardId(null)}
        onUpdated={handleDataChanged}
      />
    </div>
  );
}

