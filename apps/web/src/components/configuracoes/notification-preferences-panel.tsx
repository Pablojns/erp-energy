'use client';

import { useCallback, useEffect, useState } from 'react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

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

export function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

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
