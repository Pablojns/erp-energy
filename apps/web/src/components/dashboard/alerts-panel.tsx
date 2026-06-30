'use client';

import Link from 'next/link';
import { AlertTriangle, FileWarning, PackageX } from 'lucide-react';
import type { DashboardResumo, NfAlertRow } from '@/src/components/dashboard/types';
import { formatNumber } from '@/src/components/dashboard/utils';

type AlertsPanelProps = {
  resumo: DashboardResumo | null;
  criticalProductsCount: number;
  overdueNfs: NfAlertRow[];
};

export function AlertsPanel({ resumo, criticalProductsCount, overdueNfs }: AlertsPanelProps) {
  const alertas = resumo?.alertas;
  const items: Array<{
    key: string;
    tone: 'danger' | 'warning';
    icon: typeof AlertTriangle;
    title: string;
    desc: string;
    href: string;
  }> = [];

  const atrasados = Number(alertas?.pedidosAtrasados) || 0;
  if (atrasados > 0) {
    items.push({
      key: 'atrasados',
      tone: 'danger',
      icon: AlertTriangle,
      title: `${formatNumber(atrasados)} pedidos atrasados`,
      desc: 'Entrega prevista já passou — priorize expedição.',
      href: '/app/expedicao/pedidos?filter=atrasado',
    });
  }

  if (criticalProductsCount > 0) {
    items.push({
      key: 'estoque',
      tone: 'warning',
      icon: PackageX,
      title: `${formatNumber(criticalProductsCount)} produtos críticos`,
      desc: 'Estoque zerado ou abaixo do mínimo.',
      href: '/app/estoque',
    });
  }

  if (overdueNfs.length > 0) {
    items.push({
      key: 'nfs',
      tone: 'warning',
      icon: FileWarning,
      title: `${formatNumber(overdueNfs.length)} NFs sem pagamento (+12d)`,
      desc: 'Notas em aberto há mais de 12 dias.',
      href: '/app/financeiro',
    });
  }

  const semNf = Number(alertas?.pedidosSemNF) || 0;
  if (semNf > 0) {
    items.push({
      key: 'sem-nf',
      tone: 'warning',
      icon: FileWarning,
      title: `${formatNumber(semNf)} pedidos sem NF`,
      desc: 'Finalizados aguardando nota fiscal.',
      href: '/app/expedicao/pedidos?filter=aguardando_nf',
    });
  }

  return (
    <div className="dash-card w-full p-4 md:p-6 h-full">
      <h3 className="text-sm font-semibold text-[var(--dash-text)]">Alertas prioritários</h3>
      <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">
        Itens que exigem atenção imediata
      </p>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--dash-text-muted)]">Nenhum alerta no momento.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`dash-alert-item dash-alert-item--${item.tone}`}
                >
                  <Icon size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--dash-text)]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--dash-text-muted)]">{item.desc}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AlertsPanelSkeleton() {
  return (
    <div className="dash-card w-full space-y-3 p-4 md:p-6 h-full">
      <div className="dash-skeleton h-4 w-36" />
      <div className="dash-skeleton h-3 w-48" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="dash-skeleton h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}