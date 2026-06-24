'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Shield, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

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

function formatActionLabel(action: string): string {
  const label = action.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function PermissionSwitch({
  granted,
  disabled,
  onToggle,
}: {
  granted: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={granted}
      disabled={disabled}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50 ${
        granted ? 'bg-blue-600' : 'bg-zinc-600'
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
          className="animate-pulse rounded-xl border border-white/10 bg-white/[0.03] p-4"
        >
          <div className="mb-3 h-4 w-32 rounded bg-white/10" />
          <div className="space-y-2">
            <div className="h-8 rounded bg-white/5" />
            <div className="h-8 rounded bg-white/5" />
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
      for (const row of rows) {
        initialExpanded[row.module] = true;
      }
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

  const grouped = useMemo(() => {
    const map = new Map<string, UserPermissionRow[]>();
    for (const row of permissions) {
      const list = map.get(row.module) ?? [];
      list.push(row);
      map.set(row.module, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
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

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-white/10"
      style={{ background: 'var(--color-background-secondary)' }}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Permissões de {userName}
            </h3>
            <p className="text-xs text-zinc-500">
              Controle de acesso por módulo e ação
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
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
            className="mt-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3 p-4">
          {grouped.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-zinc-500">
              Nenhuma permissão cadastrada no sistema.
            </p>
          ) : (
            grouped.map(([module, rows]) => {
              const isOpen = expanded[module] ?? true;
              return (
                <section
                  key={module}
                  className="overflow-hidden rounded-xl border border-white/10 bg-[#121724]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [module]: !isOpen,
                      }))
                    }
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.03]"
                  >
                    <span className="text-xs font-bold tracking-wider text-zinc-300">
                      {module.toUpperCase()}
                    </span>
                    {isOpen ? (
                      <ChevronDown size={16} className="text-zinc-500" />
                    ) : (
                      <ChevronRight size={16} className="text-zinc-500" />
                    )}
                  </button>

                  {isOpen ? (
                    <ul className="divide-y divide-white/5 border-t border-white/5">
                      {rows.map((permission) => (
                        <li
                          key={permission.id}
                          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-100">
                              {formatActionLabel(permission.action)}
                            </p>
                            {permission.description ? (
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {permission.description}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                permission.granted
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : 'bg-zinc-500/15 text-zinc-400'
                              }`}
                            >
                              {permission.granted ? 'Liberado' : 'Bloqueado'}
                            </span>
                            <PermissionSwitch
                              granted={permission.granted}
                              disabled={savingId === permission.id}
                              onToggle={() => void togglePermission(permission)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
