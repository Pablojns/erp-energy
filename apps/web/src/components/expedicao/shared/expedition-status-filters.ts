import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Ban,
  Box,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Flame,
  PackageCheck,
  Zap,
} from 'lucide-react';
import type { StatusFilterId } from '@/src/components/expedicao/shared/types';

export type ExpeditionStatusFilterTone =
  | 'sky'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'emerald'
  | 'slate'
  | 'indigo';

/** Filtro de status configurável (mock local — futura origem: API da empresa). */
export type ExpeditionStatusFilterConfig = {
  key: StatusFilterId;
  label: string;
  color: ExpeditionStatusFilterTone;
  icon: LucideIcon;
  enabled: boolean;
  hint?: string;
};

/**
 * TODO: carregar filtros da configuração da empresa
 * (Configurações → Expedição → Filtros de status).
 */
export const expeditionStatusFilters: ExpeditionStatusFilterConfig[] = [
  {
    key: 'all',
    label: 'Todos',
    color: 'slate',
    icon: ClipboardList,
    enabled: true,
    hint: 'Pedidos ativos no fluxo operacional.',
  },
  {
    key: 'cotacao',
    label: 'Aguardando cotação',
    color: 'sky',
    icon: Clock,
    enabled: true,
    hint: 'Novos e analisados aguardando triagem.',
  },
  {
    key: 'urgente',
    label: 'Urgente',
    color: 'rose',
    icon: Flame,
    enabled: true,
    hint: 'Prioridade máxima — SLA curto.',
  },
  {
    key: 'atrasado',
    label: 'Atrasado',
    color: 'orange',
    icon: CalendarClock,
    enabled: true,
    hint: 'Prazo de entrega vencido.',
  },
  {
    key: 'aguardando_nf',
    label: 'Aguardando NF',
    color: 'violet',
    icon: FileText,
    enabled: true,
    hint: 'Separados aguardando nota fiscal.',
  },
  {
    key: 'parcial',
    label: 'Parcial',
    color: 'amber',
    icon: AlertTriangle,
    enabled: true,
    hint: 'Reserva ou separação incompleta.',
  },
  {
    key: 'aguardando_estoque',
    label: 'Aguardando estoque',
    color: 'orange',
    icon: Box,
    enabled: true,
    hint: 'Ruptura ou SKU pendente — ainda pode seguir fluxo.',
  },
  {
    key: 'pronto_separacao',
    label: 'Pronto separação',
    color: 'indigo',
    icon: PackageCheck,
    enabled: true,
    hint: 'Reservado e liberado para o piso.',
  },
  {
    key: 'em_separacao',
    label: 'Em separação',
    color: 'violet',
    icon: Zap,
    enabled: true,
    hint: 'Operador separando no momento.',
  },
  {
    key: 'finalizado',
    label: 'Finalizado',
    color: 'emerald',
    icon: CheckCircle2,
    enabled: true,
    hint: 'Fluxo encerrado — consulte Saídas.',
  },
  {
    key: 'cancelado',
    label: 'Cancelado',
    color: 'slate',
    icon: Ban,
    enabled: true,
    hint: 'Pedidos cancelados.',
  },
];

export function getEnabledExpeditionStatusFilters(): ExpeditionStatusFilterConfig[] {
  return expeditionStatusFilters.filter((f) => f.enabled);
}
