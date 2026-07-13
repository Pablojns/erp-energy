'use client';

import { useCallback, useEffect, useState } from 'react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import type { NotificationConfigDto } from '@/src/services/api/notifications-api';

const PREFERENCE_ITEMS = [
  {
    type: 'ORDER_DELAYED',
    label: 'Pedido atrasado',
    description: 'Pedido com data de entrega vencida',
  },
  {
    type: 'NF_PENDING',
    label: 'NF pendente',
    description: 'Pedido separado há mais de 1 dia sem NF',
  },
  {
    type: 'ORDER_URGENT',
    label: 'Pedido urgente',
    description: 'Pedido urgente sem separação iniciada',
  },
  {
    type: 'STOCK_LOW',
    label: 'Estoque baixo',
    description: 'Produto abaixo do estoque mínimo',
  },
  {
    type: 'STOCK_OUT',
    label: 'Estoque zerado',
    description: 'Produto zerado com pedido pendente',
  },
  {
    type: 'PURCHASE_RECEIVED',
    label: 'Compra recebida',
    description: 'Compra marcada como recebida',
  },
  {
    type: 'PURCHASE_OVERDUE',
    label: 'Compra atrasada',
    description: 'Compra com previsão vencida sem recebimento',
  },
  {
    type: 'CRM_FOLLOWUP',
    label: 'Follow-up CRM',
    description: 'Lead sem touchpoint há mais de 3 dias',
  },
  {
    type: 'CRM_PROPOSAL_EXPIRING',
    label: 'Proposta vencendo',
    description: 'Proposta comercial vencendo em 2 dias',
  },
  {
    type: 'CRM_LEAD_ASSIGNED',
    label: 'Lead atribuído',
    description: 'Lead atribuído a você',
  },
  {
    type: 'MENTION',
    label: 'Menções',
    description: 'Você foi mencionado em uma observação',
  },
  {
    type: 'SYSTEM',
    label: 'Sistema',
    description: 'Avisos gerais do sistema',
  },
] as const;

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'Não definido' },
  { value: 'GESTAO', label: 'Gestão' },
  { value: 'COMERCIAL', label: 'Comercial' },
  { value: 'LOGISTICA', label: 'Logística' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
  { value: 'ADMIN', label: 'Administração' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'OPERACIONAL', label: 'Operacional' },
] as const;

export { DEPARTMENT_OPTIONS };

export function NotificationPreferencesPanel(props: { isAdmin?: boolean }) {
  const isAdmin = props.isAdmin ?? false;
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState<NotificationConfigDto | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await erpFetchJson<{ preferences: Record<string, boolean> }>(
        'notifications/preferences',
      );
      setPreferences(res.preferences ?? {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Falha ao carregar preferências.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    if (!isAdmin) return;
    setConfigError(null);
    try {
      const res = await erpFetchJson<NotificationConfigDto>('notifications/config');
      setConfig(res);
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : 'Falha ao carregar configurações.',
      );
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
    void loadConfig();
  }, [load, loadConfig]);

  const toggle = (type: string) => {
    setPreferences((prev) => ({
      ...prev,
      [type]: !(prev[type] !== false),
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await erpFetchJson<{ preferences: Record<string, boolean> }>(
        'notifications/preferences',
        {
          method: 'PATCH',
          body: JSON.stringify({ preferences }),
        },
      );
      setPreferences(res.preferences);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Falha ao salvar preferências.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setConfigSaving(true);
    setConfigError(null);
    try {
      const res = await erpFetchJson<NotificationConfigDto>('notifications/config', {
        method: 'PATCH',
        body: JSON.stringify(config),
      });
      setConfig(res);
      setConfigSaved(true);
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : 'Falha ao salvar configurações.',
      );
    } finally {
      setConfigSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-[var(--erp-fg-muted)]">
        Carregando preferências…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div>
        <h3 className="text-lg font-semibold text-[var(--erp-fg)]">
          Preferências de notificações
        </h3>
        <p className="mt-1 text-sm text-[var(--erp-fg-muted)]">
          Escolha quais tipos de alerta você deseja receber.
        </p>
      </div>

      {isAdmin && config ? (
        <div className="space-y-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-bg-muted)] p-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--erp-fg)]">
              Limites do sistema (admin)
            </h3>
            <p className="mt-1 text-xs text-[var(--erp-fg-muted)]">
              Define quando os alertas automáticos são disparados.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--erp-fg-muted)]">
                Estoque crítico (unidades)
              </span>
              <input
                type="number"
                min={1}
                className="erp-module-input"
                value={config.criticalStockThreshold}
                onChange={(e) => {
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          criticalStockThreshold: Number(e.target.value) || 1,
                        }
                      : prev,
                  );
                  setConfigSaved(false);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--erp-fg-muted)]">
                Pedido atrasado (dias)
              </span>
              <input
                type="number"
                min={0}
                className="erp-module-input"
                value={config.orderDelayedDays}
                onChange={(e) => {
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          orderDelayedDays: Number(e.target.value) || 0,
                        }
                      : prev,
                  );
                  setConfigSaved(false);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--erp-fg-muted)]">
                Lead sem follow-up (dias)
              </span>
              <input
                type="number"
                min={1}
                className="erp-module-input"
                value={config.leadFollowupDays}
                onChange={(e) => {
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          leadFollowupDays: Number(e.target.value) || 1,
                        }
                      : prev,
                  );
                  setConfigSaved(false);
                }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-[var(--erp-fg-muted)]">
                NF pendente (horas)
              </span>
              <input
                type="number"
                min={1}
                className="erp-module-input"
                value={config.nfPendingHours}
                onChange={(e) => {
                  setConfig((prev) =>
                    prev
                      ? {
                          ...prev,
                          nfPendingHours: Number(e.target.value) || 1,
                        }
                      : prev,
                  );
                  setConfigSaved(false);
                }}
              />
            </label>
          </div>
          {configError ? (
            <p className="text-sm text-rose-500">{configError}</p>
          ) : null}
          {configSaved ? (
            <p className="text-sm text-emerald-600">Limites salvos.</p>
          ) : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={configSaving}
              onClick={() => void saveConfig()}
              className="erp-btn erp-btn-secondary erp-btn--md disabled:opacity-50"
            >
              {configSaving ? 'Salvando…' : 'Salvar limites'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {PREFERENCE_ITEMS.map((item) => {
          const enabled = preferences[item.type] !== false;
          return (
            <label
              key={item.type}
              className="flex items-start justify-between gap-4 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-card)] px-4 py-3"
            >
              <span>
                <span className="block text-sm font-medium text-[var(--erp-fg)]">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--erp-fg-muted)]">
                  {item.description}
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => toggle(item.type)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                  enabled ? 'bg-[var(--erp-accent)]' : 'bg-[var(--erp-border)]'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                    enabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </label>
          );
        })}
      </div>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-emerald-600">Preferências salvas.</p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="erp-btn erp-btn-primary erp-btn--md disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar preferências'}
        </button>
      </div>
    </div>
  );
}
