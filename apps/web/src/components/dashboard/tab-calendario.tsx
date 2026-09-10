'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatCurrency } from '@/src/components/dashboard/utils';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type CalendarioTipoFiltro = 'pagar' | 'receber' | 'compras';

type CalendarioItem = {
  id: string;
  tipo: 'RECEBER' | 'PAGAR' | 'COMPRAS';
  numero: string | null;
  descricao: string;
  contraParte: string | null;
  valor: number;
  status: string;
  pago: boolean;
  vencimento: string;
  overdue: boolean;
};

type CalendarioDia = {
  ymd: string;
  aPagar: number;
  aReceber: number;
  compras: number;
  overdue: boolean;
  items: CalendarioItem[];
};

type CalendarioResponse = {
  source: 'conta_azul' | 'erp';
  year: number;
  month: number;
  days: Record<string, CalendarioDia>;
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const FILTERS: { id: CalendarioTipoFiltro; label: string }[] = [
  { id: 'pagar', label: 'Contas a Pagar' },
  { id: 'receber', label: 'Contas a Receber' },
  { id: 'compras', label: 'Compras' },
];

function ymdLocal(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function monthLabel(year: number, month: number): string {
  const raw = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function todayYmd(): string {
  const n = new Date();
  return ymdLocal(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function itemMatches(
  item: CalendarioItem,
  types: Record<CalendarioTipoFiltro, boolean>,
): boolean {
  if (item.tipo === 'PAGAR') return types.pagar;
  if (item.tipo === 'RECEBER') return types.receber;
  return types.compras;
}

function formatTituloLine(item: CalendarioItem): string {
  const parts: string[] = [];
  if (item.numero) {
    parts.push(item.tipo === 'PAGAR' ? `Boleto/Doc ${item.numero}` : `NF ${item.numero}`);
  }
  parts.push(item.contraParte || item.descricao);
  parts.push(formatCurrency(item.valor));
  if (item.pago) parts.push('pago');
  else if (item.overdue) parts.push('vencido');
  return parts.join(' · ');
}

export function TabCalendario({ refreshKey }: { refreshKey: number }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [types, setTypes] = useState<Record<CalendarioTipoFiltro, boolean>>({
    pagar: true,
    receber: true,
    compras: true,
  });
  const [data, setData] = useState<CalendarioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await erpFetchJson<CalendarioResponse>(
        `api/erp/dashboard/calendario?year=${year}&month=${month}`,
      );
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Erro ao carregar calendário.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
    setSelected(null);
  };

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const prevDays = new Date(year, month - 1, 0).getDate();
    const out: Array<{ ymd: string; day: number; inMonth: boolean }> = [];
    for (let i = startOffset - 1; i >= 0; i -= 1) {
      const day = prevDays - i;
      const d = new Date(year, month - 2, day);
      out.push({
        ymd: ymdLocal(d.getFullYear(), d.getMonth() + 1, day),
        day,
        inMonth: false,
      });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      out.push({ ymd: ymdLocal(year, month, day), day, inMonth: true });
    }
    while (out.length % 7 !== 0) {
      const extra = out.length - (startOffset + daysInMonth) + 1;
      const d = new Date(year, month, extra);
      out.push({
        ymd: ymdLocal(d.getFullYear(), d.getMonth() + 1, extra),
        day: extra,
        inMonth: false,
      });
    }
    return out;
  }, [year, month]);

  const days = data?.days ?? {};
  const today = todayYmd();
  const selectedDay = selected ? days[selected] : null;
  const selectedItems = (selectedDay?.items ?? []).filter((item) =>
    itemMatches(item, types),
  );

  const visibleTotals = (dia: CalendarioDia | undefined) => {
    if (!dia) return { pagar: 0, receber: 0, compras: 0, overdue: false };
    const pagar = types.pagar ? dia.aPagar : 0;
    const receber = types.receber ? dia.aReceber : 0;
    const compras = types.compras ? (dia.compras ?? 0) : 0;
    const overdue = dia.items.some((it) => {
      if (!it.overdue || it.pago) return false;
      return itemMatches(it, types);
    });
    return { pagar, receber, compras, overdue };
  };

  return (
    <div className="dash-tab-panel dash-cal">
      <div className="dash-cal-toolbar">
        <div className="dash-cal-nav">
          <button type="button" className="dash-cal-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft size={18} />
          </button>
          <h2 className="dash-cal-title">{monthLabel(year, month)}</h2>
          <button type="button" className="dash-cal-nav-btn" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="dash-cal-filters" role="group" aria-label="Filtrar tipo de atividade">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`dash-cal-filter ${types[id] ? 'dash-cal-filter--active' : ''}`}
              aria-pressed={types[id]}
              onClick={() => setTypes((prev) => ({ ...prev, [id]: !prev[id] }))}
            >
              {types[id] ? '☑ ' : '☐ '}
              {label}
            </button>
          ))}
        </div>
        <p className="dash-cal-source">
          {data?.source === 'conta_azul'
            ? 'Fonte: Conta Azul + Compras'
            : 'Fonte: ERP + Compras (sincronize a Conta Azul no Financeiro)'}
        </p>
      </div>

      {error ? <p className="dash-cal-error">{error}</p> : null}

      <div className="dash-cal-grid" role="grid" aria-label="Calendário de atividades">
        {WEEKDAYS.map((w) => (
          <div key={w} className="dash-cal-weekday">
            {w}
          </div>
        ))}
        {cells.map((cell) => {
          const dia = days[cell.ymd];
          const totals = visibleTotals(dia);
          const isToday = cell.ymd === today;
          const isSelected = cell.ymd === selected;
          const comprasLabel =
            totals.compras === 1
              ? 'Compras — 1 item aguardando chegada'
              : `Compras — ${totals.compras} itens aguardando chegada`;
          return (
            <button
              key={cell.ymd}
              type="button"
              className={[
                'dash-cal-cell',
                cell.inMonth ? '' : 'dash-cal-cell--muted',
                totals.overdue ? 'dash-cal-cell--overdue' : '',
                isToday ? 'dash-cal-cell--today' : '',
                isSelected ? 'dash-cal-cell--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelected(cell.ymd)}
            >
              <span className="dash-cal-daynum">{cell.day}</span>
              {loading && cell.inMonth ? <span className="dash-cal-skel" /> : null}
              {totals.pagar > 0 ? (
                <span className="dash-cal-badge dash-cal-badge--pagar">
                  R$ {formatCurrency(totals.pagar).replace('R$', '').trim()} a pagar
                </span>
              ) : null}
              {totals.receber > 0 ? (
                <span className="dash-cal-badge dash-cal-badge--receber">
                  R$ {formatCurrency(totals.receber).replace('R$', '').trim()} a receber
                </span>
              ) : null}
              {totals.compras > 0 ? (
                <span className="dash-cal-badge dash-cal-badge--compras" title={comprasLabel}>
                  {comprasLabel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="erp-modal-overlay dash-cal-modal">
          <div
            className="erp-modal-backdrop"
            aria-hidden
            onClick={() => setSelected(null)}
          />
          <section
            className="erp-modal-panel dash-cal-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-cal-modal-title"
          >
            <div className="dash-cal-modal-head">
              <h3 id="dash-cal-modal-title">
                {new Date(`${selected}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </h3>
              <button
                type="button"
                className="dash-cal-modal-close"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="dash-cal-modal-body">
              {selectedItems.length === 0 ? (
                <p className="dash-cal-empty">Nenhuma atividade neste dia.</p>
              ) : (
                <ul>
                  {selectedItems.map((item) => (
                    <li key={`${item.tipo}-${item.id}`} className={item.overdue ? 'dash-cal-item--overdue' : ''}>
                      <span
                        className={`dash-cal-dot ${
                          item.tipo === 'PAGAR'
                            ? 'dash-cal-dot--pagar'
                            : item.tipo === 'RECEBER'
                              ? 'dash-cal-dot--receber'
                              : 'dash-cal-dot--compras'
                        }`}
                      />
                      <div>
                        {item.tipo === 'COMPRAS' ? (
                          <>
                            <strong>
                              Compras · aguardando chegada
                              {item.valor > 0 ? ` · ${item.valor} un.` : ''}
                            </strong>
                            <p>
                              {item.numero ? `${item.numero} · ` : ''}
                              {item.descricao}
                              {item.contraParte ? ` · ${item.contraParte}` : ''}
                              {item.overdue ? ' · atrasada' : ''}
                            </p>
                          </>
                        ) : (
                          <strong>{formatTituloLine(item)}</strong>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
