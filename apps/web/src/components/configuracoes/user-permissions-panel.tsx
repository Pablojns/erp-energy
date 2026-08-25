'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Shield, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import {
  ADMIN_PERMISSION_MODULES,
  CRUD_PERMISSION_COLUMNS,
  EXTRA_ACTION_LABELS,
  MODULE_EXTRA_ACTIONS,
  isCrudAction,
  isLegacyHiddenAction,
} from '@/src/services/auth/permission-catalog';

export type UserPermissionRow = {
  id: string;
  module: string;
  action: string;
  description: string | null;
  granted: boolean;
};

type ApiUserPermission = {
  permissionId?: string;
  id?: string;
  module: string;
  action: string;
  description: string | null;
  granted: boolean;
};

type UserPermissionsPanelProps = {
  userId: string;
  userName: string;
  isAdmin: boolean;
  onClose?: () => void;
};

function extraActionLabel(action: string, description: string | null): string {
  return EXTRA_ACTION_LABELS[action] ?? description ?? action.replace(/_/g, ' ');
}

function PermissionSwitch({
  granted,
  disabled,
  onToggle,
  label,
}: {
  granted: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        granted ? 'bg-[var(--accent)]' : 'bg-[var(--erp-bg-muted)]'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          granted ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function PermissionsSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
          <div className="mb-3 h-4 w-32 rounded bg-gray-100" />
          <div className="space-y-2">
            <div className="h-8 rounded bg-gray-50" />
            <div className="h-8 rounded bg-gray-50" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UserPermissionsPanel({
  userId,
  userName,
  isAdmin,
  onClose,
}: UserPermissionsPanelProps) {
  const [permissions, setPermissions] = useState<UserPermissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await erpFetchJson<ApiUserPermission[]>(
        `api/users/${userId}/permissions`,
      );
      const rows: UserPermissionRow[] = (Array.isArray(data) ? data : []).map(
        (row) => ({
          id: row.id ?? row.permissionId ?? '',
          module: row.module,
          action: row.action,
          description: row.description,
          granted: row.granted ?? false,
        }),
      );
      setPermissions(rows);
      const initialExpanded: Record<string, boolean> = {};
      for (const mod of ADMIN_PERMISSION_MODULES) {
        initialExpanded[mod.id] = true;
      }
      initialExpanded.notificacoes = false;
      setExpanded(initialExpanded);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Falha ao carregar permissões.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isAdmin) return;
    load();
  }, [isAdmin, load]);

  const byModule = useMemo(() => {
    const map = new Map<string, UserPermissionRow[]>();
    for (const row of permissions) {
      const list = map.get(row.module) ?? [];
      list.push(row);
      map.set(row.module, list);
    }
    return map;
  }, [permissions]);

  const togglePermission = async (permission: UserPermissionRow) => {
    const nextGranted = !permission.granted;
    setPermissions((prev) =>
      prev.map((p) =>
        p.id === permission.id ? { ...p, granted: nextGranted } : p,
      ),
    );
    setSavingId(permission.id);

    try {
      await erpFetchJson(`api/users/${userId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({
          permissionId: permission.id,
          granted: nextGranted,
        }),
      });
    } catch (err) {
      setPermissions((prev) =>
        prev.map((p) =>
          p.id === permission.id ? { ...p, granted: permission.granted } : p,
        ),
      );
      setError(
        err instanceof Error ? err.message : 'Falha ao atualizar permissão.',
      );
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) {
    return null;
  }

  const notificationRows = (byModule.get('notificacoes') ?? []).filter(
    (row) => !isLegacyHiddenAction(row.action),
  );

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-gray-200"
      style={{ background: 'var(--color-background-secondary)' }}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Permissões de {userName}
            </h3>
            <p className="text-xs text-gray-500">
              ADMIN tem acesso total. Operadores só o que estiver marcado.
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar painel de permissões"
          >
            <X size={18} />
          </button>
        ) : null}
      </div>

      {loading ? <PermissionsSkeleton /> : null}

      {!loading && error ? (
        <div className="p-5">
          <p className="text-sm text-rose-400">{error}</p>
          <button
            type="button"
            onClick={load}
            className="erp-focus-ring erp-btn erp-btn-primary erp-btn--sm mt-3"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3 p-4">
          {ADMIN_PERMISSION_MODULES.map((mod) => {
            const rows = byModule.get(mod.id) ?? [];
            const crudByAction = new Map(
              rows.filter((row) => isCrudAction(row.action)).map((row) => [row.action, row]),
            );
            const extraActions = MODULE_EXTRA_ACTIONS[mod.id] ?? [];
            const extras = extraActions
              .map((action) => rows.find((row) => row.action === action))
              .filter((row): row is UserPermissionRow => Boolean(row));
            const leftover = rows.filter(
              (row) =>
                !isCrudAction(row.action) &&
                !isLegacyHiddenAction(row.action) &&
                !extraActions.includes(row.action),
            );
            const isOpen = expanded[mod.id] ?? true;

            return (
              <section key={mod.id} className="erp-module-card overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({
                      ...prev,
                      [mod.id]: !isOpen,
                    }))
                  }
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-100"
                >
                  <span className="text-xs font-bold tracking-wider text-gray-600">
                    {mod.label.toUpperCase()}
                  </span>
                  {isOpen ? (
                    <ChevronDown size={16} className="text-gray-500" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-500" />
                  )}
                </button>

                {isOpen ? (
                  <div className="border-t border-gray-200 px-4 py-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {CRUD_PERMISSION_COLUMNS.map((col) => {
                        const permission = crudByAction.get(col.action);
                        if (!permission) {
                          return (
                            <div
                              key={col.action}
                              className="rounded-lg border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-400"
                            >
                              {col.label}
                            </div>
                          );
                        }
                        return (
                          <label
                            key={permission.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                          >
                            <span className="text-sm font-medium text-gray-900">
                              {col.label}
                            </span>
                            <PermissionSwitch
                              granted={permission.granted}
                              disabled={savingId === permission.id}
                              label={`${mod.label}: ${col.label}`}
                              onToggle={() => void togglePermission(permission)}
                            />
                          </label>
                        );
                      })}
                    </div>

                    {extras.length > 0 || leftover.length > 0 ? (
                      <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
                        {[...extras, ...leftover].map((permission) => (
                          <li
                            key={permission.id}
                            className="flex items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                {extraActionLabel(
                                  permission.action,
                                  permission.description,
                                )}
                              </p>
                              {permission.description &&
                              EXTRA_ACTION_LABELS[permission.action] ? (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {permission.description}
                                </p>
                              ) : null}
                            </div>
                            <PermissionSwitch
                              granted={permission.granted}
                              disabled={savingId === permission.id}
                              label={extraActionLabel(
                                permission.action,
                                permission.description,
                              )}
                              onToggle={() => void togglePermission(permission)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}

          {notificationRows.length > 0 ? (
            <section className="erp-module-card overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => ({
                    ...prev,
                    notificacoes: !(prev.notificacoes ?? false),
                  }))
                }
                className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-100"
              >
                <span className="text-xs font-bold tracking-wider text-gray-600">
                  NOTIFICAÇÕES
                </span>
                {expanded.notificacoes ? (
                  <ChevronDown size={16} className="text-gray-500" />
                ) : (
                  <ChevronRight size={16} className="text-gray-500" />
                )}
              </button>
              {expanded.notificacoes ? (
                <ul className="divide-y divide-gray-100 border-t border-gray-200">
                  {notificationRows.map((permission) => (
                    <li
                      key={permission.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {extraActionLabel(
                          permission.action,
                          permission.description,
                        )}
                      </p>
                      <PermissionSwitch
                        granted={permission.granted}
                        disabled={savingId === permission.id}
                        onToggle={() => void togglePermission(permission)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
