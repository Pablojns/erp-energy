'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { CrmCardDetailModal } from '@/src/components/crm/crm-card-detail-modal';
import { CrmClientesList } from '@/src/components/crm/crm-clientes-list';
import { CrmCreateCardModal } from '@/src/components/crm/crm-create-card-modal';
import { CrmCreateFunilModal } from '@/src/components/crm/crm-create-funil-modal';
import { CrmDashboard } from '@/src/components/crm/crm-dashboard';
import { CrmKanbanBoard } from '@/src/components/crm/crm-kanban-board';
import { CrmSettingsModal } from '@/src/components/crm/crm-settings-modal';
import { CrmSidebar, type CrmView } from '@/src/components/crm/crm-sidebar';
import {
  getCrmDashboard,
  listCrmCards,
  listCrmChannels,
  listCrmFunis,
  listCrmStatuses,
  type CrmCardDto,
  type CrmCardOrigin,
  type CrmChannelDto,
  type CrmDashboardDto,
  type CrmFunilDto,
  type CrmStatusDto,
} from '@/src/services/api/crm-api';

const VIEW_TITLE: Record<Exclude<CrmView, 'relatorios'>, string> = {
  dashboard: 'Dashboard',
  kanban: 'Kanban',
  clientes: 'Clientes',
};

export function CrmWorkspace() {
  const [activeView, setActiveView] = useState<CrmView>('dashboard');
  const [funis, setFunis] = useState<CrmFunilDto[]>([]);
  const [statuses, setStatuses] = useState<CrmStatusDto[]>([]);
  const [channels, setChannels] = useState<CrmChannelDto[]>([]);
  const [cards, setCards] = useState<CrmCardDto[]>([]);
  const [dashboard, setDashboard] = useState<CrmDashboardDto | null>(null);
  const [originFilter, setOriginFilter] = useState<CrmCardOrigin | 'TODOS'>('TODOS');
  const [loadingData, setLoadingData] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [funilModalOpen, setFunilModalOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoadingData(true);
      setError(null);
      try {
        const [funisData, cardsData, statusesData, channelsData] = await Promise.all([
          listCrmFunis(),
          listCrmCards(),
          listCrmStatuses(),
          listCrmChannels(),
        ]);
        if (!controller.signal.aborted) {
          setFunis(funisData);
          setCards(cardsData);
          setStatuses(statusesData);
          setChannels(channelsData);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar CRM.');
          setFunis([]);
          setCards([]);
          setStatuses([]);
          setChannels([]);
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
        const data = await getCrmDashboard(originFilter);
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
  }, [activeView, originFilter, refreshToken]);

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
          <h2 className="text-lg font-semibold text-[var(--erp-fg)]">{viewTitle}</h2>

          <div className="flex flex-wrap items-center gap-2">
            {showKanbanActions ? (
              <button
                type="button"
                onClick={() => setFunilModalOpen(true)}
                className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--md"
              >
                Criar funil
              </button>
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
              onOriginFilterChange={setOriginFilter}
            />
          ) : null}

          {activeView === 'kanban' ? (
            <section className="erp-module-panel min-h-0 flex-1 overflow-hidden p-3">
              <CrmKanbanBoard
                funis={funis}
                cards={cards}
                loading={loadingData}
                onOpenCard={(card) => setDetailCardId(card.id)}
                onCardMoved={handleCardMoved}
                onError={setError}
              />
            </section>
          ) : null}

          {activeView === 'clientes' ? (
            <CrmClientesList
              cards={cards}
              funis={funis}
              loading={loadingData}
              onOpenCard={(card) => setDetailCardId(card.id)}
            />
          ) : null}
        </div>
      </div>

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
      />

      <CrmSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onChanged={refresh}
      />

      <CrmCardDetailModal
        cardId={detailCardId}
        funis={funis}
        statuses={statuses}
        channels={channels}
        onClose={() => setDetailCardId(null)}
        onUpdated={handleDataChanged}
      />
    </div>
  );
}
