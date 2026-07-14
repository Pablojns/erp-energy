'use client';

/* eslint-disable react-hooks/set-state-in-effect -- carregamento sob montagem, aba e debounce de busca */
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Ban,
  Bookmark,
  CircleDollarSign,
  ClipboardList,
  Download,
  Loader2,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Undo2,
  X,
  ChevronRight,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CategorySelect } from '@/src/components/estoque/category-select';
import { MovementOrderDetailModal } from '@/src/components/estoque/movement-order-detail-modal';
import {
  ErpFilterBar,
  type FilterBadgeItem,
} from '@/src/components/shared/erp-filter-bar';
import { TableColumnsPicker } from '@/src/components/shared/table-columns-picker';
import { useNavPermissions } from '@/src/components/layout/nav-permissions-context';
import { useTableColumnPreferences } from '@/src/hooks/use-table-column-preferences';
import type { ColumnDefinition } from '@/src/lib/table-column-preferences';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  DataTablePremium,
  type TableColumn,
  type TableRow,
} from '@/src/components/ui/data-table-premium';
import { EmptyState } from '@/src/components/ui/empty-state';
import {
  CardGridSkeleton,
  ListSkeleton,
  MetricCardsSkeleton,
} from '@/src/components/ui/skeleton';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type TabId = 'dashboard' | 'inventory' | 'movements';

type InventoryFilter = 'all' | 'out' | 'low' | 'reserva';

type MovePeriodPreset = 'today' | 'week' | 'month' | 'custom';

type DashboardPeriodPreset = 'today' | 'week' | 'month' | 'quarter';

type MovementUserOption = {
  id: string;
  name: string;
  email: string;
};

type CadastroOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type MovementsSummary = {
  totalInbound: number;
  totalOutbound: number;
  totalReserved: number;
  totalAdjustments: number;
  netBalance?: number;
};

type MoveTypeCardFilter = 'entrada' | 'saida' | 'reserva' | 'ajuste';

const INVENTORY_FILTER_KEY = 'erp.filters.estoque.inventario';
const MOVEMENTS_FILTER_KEY = 'erp.filters.estoque.movimentacoes';

const INVENTORY_FILTER_LABEL: Record<Exclude<InventoryFilter, 'all'>, string> = {
  out: 'Sem estoque',
  low: 'Crítico',
  reserva: 'Reserva',
};

const MOVE_TYPE_LABEL: Record<MoveTypeCardFilter, string> = {
  entrada: 'Entradas',
  saida: 'Saídas',
  reserva: 'Reservas',
  ajuste: 'Ajustes',
};

const MOVE_PERIOD_LABEL: Record<MovePeriodPreset, string> = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
  custom: 'Intervalo personalizado',
};

type InventoryFilterPreset = {
  inventoryFilter: InventoryFilter;
  showInactive: boolean;
  search: string;
  supplierId: string;
  categoryId: string;
};

type MovementFilterPreset = {
  search: string;
  types: MoveTypeCardFilter[];
  userId: string;
  period: MovePeriodPreset;
  dateFrom: string;
  dateTo: string;
};

type ProductCategoryDto = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProductCategoryMeta =
  | {
      entity: true;
      id: string;
      name: string;
      slug: string;
      color: string | null;
      inactiveCategory: boolean;
    }
  | { legacy: true; label: string };

type ProductDto = {
  id: string;
  internalCode: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string | null;
  category: string | null;
  categoryMeta: ProductCategoryMeta | null;
  price: string;
  cost: string | null;
  minStock: number;
  stockQty: number;
  reservedQty?: number;
  availableQty?: number;
  isActive: boolean;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierSku?: string | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierOption = {
  id: string;
  name: string;
  isActive: boolean;
};

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

type StockSummary = {
  activeProducts: number;
  inactiveProducts: number;
  totalUnitsOnHand: number;
  skusBelowMinStock: number;
  valorEstoque: number;
  valorVenda: number;
  periodInboundCount?: number;
  periodOutboundCount?: number;
  dailyFlow?: Array<{ date: string; inbound: number; outbound: number }>;
  topMoved?: Array<{
    productId: string;
    sku: string;
    name: string;
    totalVolume: number;
  }>;
  stagnantProducts?: Array<{
    id: string;
    sku: string;
    name: string;
    stockQty: number;
  }>;
  criticalProducts?: Array<{
    id: string;
    sku: string;
    name: string;
    stockQty: number;
    minStock: number;
    deficit: number;
  }>;
  topInboundMovements?: Array<{
    id: string;
    movementDate: string;
    quantity: number;
    productSku: string;
    productName: string;
    movedByName: string | null;
  }>;
  stockTrend?: Array<{ date: string; value: number }>;
};

type MovementRow = {
  id: string;
  movementType: string;
  quantity: number;
  reference: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  movementDate: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    internalCode: string;
  };
  movedBy: { id: string; name: string; email: string } | null;
};

function formatMovementReference(
  m: Pick<MovementRow, 'reference' | 'notes'>,
): string {
  const ref = m.reference?.trim();
  if (!ref) return '—';
  if (!ref.startsWith('PED-')) return ref;
  const fromNotes = m.notes
    ?.match(/pedido\s+(.+?)(?:\s*[-·•]|\s+NF\b|$)/i)?.[1]
    ?.trim();
  return fromNotes || ref;
}

function parseMovementOrderRefs(
  m: Pick<MovementRow, 'reference' | 'invoiceNumber' | 'notes'>,
): { pedido: string; nf: string } {
  const fromNotes = m.notes
    ?.match(/pedido\s+(.+?)(?:\s*[-·•]|\s+NF\b|$)/i)?.[1]
    ?.trim();
  const pedido =
    fromNotes ||
    (m.reference?.trim().startsWith('PED-') ? m.reference.trim() : '') ||
    '—';
  const nfFromNotes = m.notes?.match(/\bNF\s+(\S+)/i)?.[1]?.trim();
  const ref = m.reference?.trim() ?? '';
  const nf =
    m.invoiceNumber?.trim() ||
    nfFromNotes ||
    (ref && !ref.startsWith('PED-') ? ref : '') ||
    '—';
  return { pedido, nf };
}

const MOVEMENT_LABEL: Record<string, string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
  AJUSTE_QUANTIDADE: 'Ajuste quantidade',
  AJUSTE_PRECO_VENDA: 'Ajuste preço venda',
  AJUSTE_PRECO_BASE: 'Ajuste preço base',
  TRANSFER: 'Transferência',
  RETURN: 'Devolução',
  RESERVE: 'Reserva',
  RESERVE_CANCEL: 'Cancel. reserva',
  RESERVA: 'Reserva expedição',
  BAIXA_EXPEDICAO: 'Baixa expedição',
  SAIDA_EXPEDICAO: 'Saída expedição (NF)',
};

/** Payload POST /stock/movements (movementKind legível). */
type MovementKind =
  | 'entrada'
  | 'saida'
  | 'ajuste'
  | 'reserva'
  | 'cancelamento_reserva';

/** Mapeia o tipo legível para o enum aceito pela API (movementType). */
const MOVEMENT_KIND_TO_TYPE: Record<MovementKind, string> = {
  entrada: 'INBOUND',
  saida: 'OUTBOUND',
  ajuste: 'ADJUSTMENT',
  reserva: 'RESERVE',
  cancelamento_reserva: 'RESERVE_CANCEL',
};

const MOVE_MODAL_TITLE: Record<MovementKind, string> = {
  entrada: 'Nova entrada de estoque',
  saida: 'Nova saída de estoque',
  ajuste: 'Novo ajuste de estoque',
  reserva: 'Nova reserva de estoque',
  cancelamento_reserva: 'Cancelar reserva de estoque',
};

const MOVEMENT_KIND_CHIP: Record<MovementKind, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  reserva: 'Reserva',
  cancelamento_reserva: 'Cancelar reserva',
};

const QUICK_ACTION_CLASS: Record<MovementKind, string> = {
  entrada:
    'border border-[#86efac] bg-[#dcfce7] text-[#16a34a] hover:brightness-95',
  saida:
    'border border-[#fca5a5] bg-[#fee2e2] text-[#dc2626] hover:brightness-95',
  ajuste:
    'border border-[#fcd34d] bg-[#fef3c7] text-[#d97706] hover:brightness-95',
  reserva:
    'border border-[#c4b5fd] bg-[#ede9fe] text-[#7c3aed] hover:brightness-95',
  cancelamento_reserva:
    'border border-[#cbd5e1] bg-[#f1f5f9] text-[#64748b] hover:brightness-95',
};

type AuthMeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    roles: string[];
  };
};

function formatBrl(value: string) {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n);
}

function isAjusteMovementType(type: string) {
  return (
    type === 'ADJUSTMENT' ||
    type === 'AJUSTE_QUANTIDADE' ||
    type === 'AJUSTE_PRECO_VENDA' ||
    type === 'AJUSTE_PRECO_BASE'
  );
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayIsoDate() {
  return toIsoDate(new Date());
}

function resolveMovePeriodRange(
  period: MovePeriodPreset,
  customFrom: string,
  customTo: string,
): { startDate?: string; endDate?: string } {
  if (period === 'custom') {
    return {
      startDate: customFrom.trim() || undefined,
      endDate: customTo.trim() || undefined,
    };
  }
  const endDate = todayIsoDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === 'today') {
    return { startDate: endDate, endDate };
  }
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { startDate: toIsoDate(start), endDate };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: toIsoDate(start), endDate };
}

function hasDashboardCustomDateRange(customFrom: string, customTo: string) {
  return customFrom.trim() !== '' || customTo.trim() !== '';
}

function resolveDashboardPeriodRange(
  period: DashboardPeriodPreset,
  customFrom: string,
  customTo: string,
): { startDate: string; endDate: string } {
  if (hasDashboardCustomDateRange(customFrom, customTo)) {
    const endDate = customTo.trim() || todayIsoDate();
    const startDate = customFrom.trim() || endDate;
    return { startDate, endDate };
  }
  const endDate = todayIsoDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (period === 'today') {
    return { startDate: endDate, endDate };
  }
  if (period === 'week') {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return { startDate: toIsoDate(start), endDate };
  }
  if (period === 'quarter') {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return { startDate: toIsoDate(start), endDate };
  }
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { startDate: toIsoDate(start), endDate };
}

function dashboardSectionPeriodSuffix(
  period: DashboardPeriodPreset,
  customFrom: string,
  customTo: string,
): string {
  if (hasDashboardCustomDateRange(customFrom, customTo)) {
    return '— período selecionado';
  }
  const labels: Record<DashboardPeriodPreset, string> = {
    today: '— hoje',
    week: '— esta semana',
    month: '— este mês',
    quarter: '— últimos 3 meses',
  };
  return labels[period];
}

function dashboardPeriodButtonClass(active: boolean, disabled: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
    disabled
      ? 'pointer-events-none border-[var(--border-color)] bg-transparent text-[var(--text-secondary)] opacity-40'
      : active
        ? 'border-transparent bg-[var(--accent)] text-white shadow-sm'
        : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/35 hover:text-[var(--text-primary)]'
  }`;
}

const DASHBOARD_LIST_SCROLL =
  'erp-scrollbar mt-2 max-h-[320px] space-y-2 overflow-y-auto pr-1';

function inventoryFilterButtonClass(active: boolean) {
  return `flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
    active
      ? 'border-transparent bg-[var(--accent)] text-white shadow-sm'
      : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/35 hover:text-[var(--text-primary)]'
  }`;
}

function inventoryFilterPickerButtonClass(active: boolean) {
  return `flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition ${
    active
      ? 'border-[var(--accent)]/45 bg-[var(--accent)]/10 text-[var(--text-primary)]'
      : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)] hover:border-[var(--accent)]/35 hover:text-[var(--text-primary)]'
  }`;
}

function formatPriceChangeReference(from: number, to: number) {
  return `${from.toFixed(2)}|${to.toFixed(2)}`;
}

function parsePriceChangeLabel(
  reference: string | null | undefined,
  movementType: string,
): string {
  if (
    !reference?.includes('|') ||
    (movementType !== 'AJUSTE_PRECO_VENDA' &&
      movementType !== 'AJUSTE_PRECO_BASE')
  ) {
    return '—';
  }
  const [from, to] = reference.split('|');
  if (!from || !to) return '—';
  return `De ${formatBrl(from)} para ${formatBrl(to)}`;
}

function buildMovementDeleteRevertMessage(m: MovementRow): string {
  const typeLabel = MOVEMENT_LABEL[m.movementType] ?? m.movementType;
  const productName = m.product.name;
  const responsible = m.movedBy?.name ?? '—';
  const date = formatDateTime(m.movementDate);

  if (
    m.movementType === 'AJUSTE_PRECO_VENDA' ||
    m.movementType === 'AJUSTE_PRECO_BASE'
  ) {
    const priceChange = parsePriceChangeLabel(m.reference, m.movementType);
    if (priceChange !== '—') {
      return `Esta ação irá reverter ${typeLabel}: ${priceChange} do produto ${productName} realizada por ${responsible} em ${date}. Confirma a exclusão?`;
    }
  }

  return `Esta ação irá reverter ${typeLabel} de ${m.quantity} unidade(s) do produto ${productName} realizada por ${responsible} em ${date}. Confirma a exclusão?`;
}

function movementBadgeClass(type: string) {
  if (type === 'INBOUND') {
    return 'erp-movement-badge erp-movement-badge--inbound';
  }
  if (type === 'OUTBOUND') {
    return 'erp-movement-badge erp-movement-badge--outbound';
  }
  if (isAjusteMovementType(type)) {
    return 'erp-movement-badge erp-movement-badge--adjust';
  }
  if (type === 'RESERVE' || type === 'RESERVA') {
    return 'erp-movement-badge erp-movement-badge--reserve';
  }
  if (type === 'RESERVE_CANCEL') {
    return 'erp-movement-badge erp-movement-badge--neutral';
  }
  return 'erp-movement-badge erp-movement-badge--neutral';
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatPriceFromCandidates(source: Record<string, unknown>, keys: string[]): string {
  const hasAnyKey = keys.some((k) => k in source);
  if (!hasAnyKey) return '—';
  const raw = keys.map((k) => source[k]).find((v) => v !== undefined && v !== null);
  if (raw === undefined) return formatBrl('0');
  if (typeof raw === 'number') return formatBrl(String(raw));
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isNaN(n)) return raw;
    return formatBrl(String(n));
  }
  return formatBrl('0');
}

function MiniGauge(props: { value: number; max: number; color: string }) {
  const { value, max, color } = props;
  const pct = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const angle = Math.PI * (1 - pct);
  const needleX = 24 + Math.cos(angle) * 10;
  const needleY = 28 - Math.sin(angle) * 10;
  return (
    <svg viewBox="0 0 48 32" className="h-8 w-12" aria-hidden>
      <path
        d="M10 28 A14 14 0 0 1 38 28"
        fill="none"
        stroke="var(--border-color)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M10 28 A14 14 0 0 1 38 28"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${pct * 100} 100`}
      />
      <line x1="24" y1="28" x2={needleX} y2={needleY} stroke={color} strokeWidth="2" />
      <circle cx="24" cy="28" r="2.5" fill={color} />
    </svg>
  );
}

function ProductCategoryCell({
  product,
}: {
  product: ProductDto | null | undefined;
}) {
  const meta =
    product?.categoryMeta ??
    (product?.category?.trim()
      ? ({ legacy: true, label: product.category.trim() } as const)
      : null);

  if (!meta) {
    return <span className="text-gray-600">—</span>;
  }
  if ('legacy' in meta) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span className="truncate">{meta.label}</span>
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
          legado
        </span>
      </span>
    );
  }
  const inactive = meta.inactiveCategory;
  const c = meta.color;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold tracking-tight text-gray-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
        inactive ? 'opacity-65' : ''
      }`}
      style={
        c
          ? {
              borderColor: `${c}55`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 0 16px -6px ${c}55`,
            }
          : undefined
      }
    >
      {c ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/25"
          style={{ backgroundColor: c }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{meta.name}</span>
      {inactive ? (
        <span className="shrink-0 text-[9px] font-medium text-amber-700/90">
          inativa
        </span>
      ) : null}
    </span>
  );
}

const MOVEMENT_TABLE_COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: 'pedido', label: 'Nº pedido', required: true },
  { key: 'status', label: 'Status', required: true },
  { key: 'recebedor', label: 'Recebedor', defaultVisible: false },
  { key: 'pontoDescarga', label: 'Ponto de descarga', defaultVisible: false },
  { key: 'transportadora', label: 'Transportadora', defaultVisible: false },
  { key: 'nf', label: 'NF' },
  { key: 'dataPedido', label: 'Data pedido' },
  { key: 'dataEntrega', label: 'Data entrega', defaultVisible: false },
  { key: 'valor', label: 'Valor', defaultVisible: false },
  { key: 'product', label: 'Produto' },
  { key: 'qty', label: 'Qtd' },
  { key: 'user', label: 'Responsável' },
];

const MOVEMENT_TABLE_ID = 'estoque-movimentacoes';

const movementColumnsBase: TableColumn[] = [
  { key: 'dataPedido', header: 'Data pedido', className: 'whitespace-nowrap' },
  { key: 'status', header: 'Status' },
  { key: 'pedido', header: 'Pedido', className: 'whitespace-nowrap min-w-[4.5rem]' },
  { key: 'nf', header: 'NF', className: 'whitespace-nowrap min-w-[3rem]' },
  { key: 'recebedor', header: 'Recebedor' },
  { key: 'pontoDescarga', header: 'Ponto de descarga' },
  { key: 'transportadora', header: 'Transportadora' },
  { key: 'dataEntrega', header: 'Data entrega', className: 'whitespace-nowrap' },
  { key: 'valor', header: 'Valor', className: 'whitespace-nowrap' },
  { key: 'product', header: 'Produto' },
  { key: 'qty', header: 'Qtd', className: 'text-center w-12' },
  { key: 'user', header: 'Responsável' },
];

type ProductFormState = {
  sku: string;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  minStock: string;
  supplierId: string;
  supplierSku: string;
};

const emptyForm: ProductFormState = {
  sku: '',
  name: '',
  categoryId: '',
  price: '',
  cost: '',
  minStock: '0',
  supplierId: '',
  supplierSku: '',
};

export function EstoqueWorkspace() {
  const { user } = useNavPermissions();
  const movementColumnPrefs = useTableColumnPreferences(
    user.id,
    MOVEMENT_TABLE_ID,
    MOVEMENT_TABLE_COLUMN_DEFINITIONS,
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabId>('dashboard');
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [dashboardPeriod, setDashboardPeriod] =
    useState<DashboardPeriodPreset>('month');
  const [dashboardDateFrom, setDashboardDateFrom] = useState('');
  const [dashboardDateTo, setDashboardDateTo] = useState('');
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchDebounced, setProductSearchDebounced] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [productMenuOpenId, setProductMenuOpenId] = useState<string | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('all');
  const [inventorySupplierFilterId, setInventorySupplierFilterId] = useState('');
  const [inventoryCategoryFilterId, setInventoryCategoryFilterId] = useState('');
  const [supplierFilterModalOpen, setSupplierFilterModalOpen] = useState(false);
  const [categoryFilterModalOpen, setCategoryFilterModalOpen] = useState(false);
  const [supplierFilterSearch, setSupplierFilterSearch] = useState('');
  const [categoryFilterSearch, setCategoryFilterSearch] = useState('');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsData, setProductsData] = useState<Paginated<ProductDto> | null>(
    null,
  );

  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsData, setMovementsData] = useState<Paginated<MovementRow> | null>(
    null,
  );
  const [movementsSummary, setMovementsSummary] =
    useState<MovementsSummary | null>(null);
  const [moveFilterSearch, setMoveFilterSearch] = useState('');
  const [moveFilterSearchDebounced, setMoveFilterSearchDebounced] = useState('');
  const [moveTypeCardFilters, setMoveTypeCardFilters] = useState<
    Set<MoveTypeCardFilter>
  >(() => new Set());
  const [moveFilterUserId, setMoveFilterUserId] = useState('');
  const [moveFilterPeriod, setMoveFilterPeriod] =
    useState<MovePeriodPreset>('week');
  const [moveFilterDateFrom, setMoveFilterDateFrom] = useState('');
  const [moveFilterDateTo, setMoveFilterDateTo] = useState('');
  const [movementUsers, setMovementUsers] = useState<MovementUserOption[]>([]);
  const [movementsExporting, setMovementsExporting] = useState(false);
  const [movementDeleteTarget, setMovementDeleteTarget] =
    useState<MovementRow | null>(null);
  const [movementDetailId, setMovementDetailId] = useState<string | null>(null);
  const [movementDeleteStep, setMovementDeleteStep] = useState<
    'idle' | 'confirm'
  >('idle');
  const [movementDeleting, setMovementDeleting] = useState(false);
  const [productDeleteTarget, setProductDeleteTarget] =
    useState<ProductDto | null>(null);
  const [productDeleting, setProductDeleting] = useState(false);
  const [cancelingReserveId, setCancelingReserveId] = useState<string | null>(
    null,
  );
  const [reserveOpen, setReserveOpen] = useState(false);
  const [reserveStep, setReserveStep] = useState<'form' | 'confirm'>('form');
  const [reserveReceivers, setReserveReceivers] = useState<CadastroOption[]>(
    [],
  );
  const [reserveForm, setReserveForm] = useState({
    receiverId: '',
    quantity: '',
    notes: '',
  });
  const [reserveSaving, setReserveSaving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const inventoryListScrollRef = useRef<HTMLDivElement>(null);
  const inventoryListScrollTopRef = useRef(0);

  const syncInventoryListScroll = useCallback(() => {
    if (inventoryListScrollRef.current) {
      inventoryListScrollTopRef.current =
        inventoryListScrollRef.current.scrollTop;
    }
  }, []);

  const restoreInventoryListScroll = useCallback(() => {
    const top = inventoryListScrollTopRef.current;
    requestAnimationFrame(() => {
      const el = inventoryListScrollRef.current;
      if (el) {
        el.scrollTop = top;
      }
    });
  }, []);

  const selectInventoryProduct = useCallback(
    (id: string) => {
      syncInventoryListScroll();
      setSelectedInventoryId(id);
    },
    [syncInventoryListScroll],
  );

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [editingProduct, setEditingProduct] = useState<ProductDto | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formSaving, setFormSaving] = useState(false);

  const [productCategories, setProductCategories] = useState<ProductCategoryDto[]>(
    [],
  );
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [movePresetProduct, setMovePresetProduct] = useState<ProductDto | null>(null);
  const [moveForm, setMoveForm] = useState({
    productId: '',
    movementKind: 'entrada' as MovementKind,
    quantity: '0',
    notes: '',
    cost: '',
    price: '',
  });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveNotesError, setMoveNotesError] = useState<string | null>(null);
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [moveConfirmMessages, setMoveConfirmMessages] = useState<string[]>([]);
  const [pendingPresetAjustePlan, setPendingPresetAjustePlan] = useState<{
    messages: string[];
    productPatch: Record<string, number>;
    movements: Array<{
      movementType: string;
      quantity: number;
      notes: string;
      reference?: string;
    }>;
  } | null>(null);
  const [productPicker, setProductPicker] = useState<ProductDto[]>([]);

  // Nome do usuário logado (GET auth/me) para a coluna "Responsável".
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void erpFetchJson<{ user?: { name?: string } }>('auth/me')
      .then((res) => {
        if (active) setCurrentUserName(res.user?.name ?? null);
      })
      .catch(() => {
        /* coluna exibe fallback "—" */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    inventoryListScrollTopRef.current = 0;
    if (inventoryListScrollRef.current) {
      inventoryListScrollRef.current.scrollTop = 0;
    }
  }, [productSearchDebounced, inventoryFilter, showInactive, inventorySupplierFilterId, inventoryCategoryFilterId]);

  useEffect(() => {
    if (tab !== 'inventory' || productsLoading) return;
    if (moveModalOpen || productModalOpen || moveConfirmOpen) return;
    restoreInventoryListScroll();
  }, [
    tab,
    productsLoading,
    moveModalOpen,
    productModalOpen,
    moveConfirmOpen,
    productsData,
    restoreInventoryListScroll,
  ]);

  const closeAllModals = useCallback(() => {
    setProductModalOpen(false);
    setMoveModalOpen(false);
    setMovePresetProduct(null);
    setMoveConfirmOpen(false);
    setMoveConfirmMessages([]);
    setPendingPresetAjustePlan(null);
    setMovementDeleteTarget(null);
    setMovementDeleteStep('idle');
    setProductDeleteTarget(null);
    setReserveOpen(false);
    setReserveStep('form');
    setMovementDetailId(null);
    setSupplierFilterModalOpen(false);
    setCategoryFilterModalOpen(false);
  }, []);

  useCloseOverlaysOnRouteChange(closeAllModals);

  useEffect(() => {
    if (
      !productModalOpen &&
      !moveModalOpen &&
      movementDeleteStep === 'idle' &&
      !productDeleteTarget &&
      !reserveOpen &&
      !movementDetailId
    )
      return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllModals();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [productModalOpen, moveModalOpen, movementDeleteStep, productDeleteTarget, reserveOpen, movementDetailId, closeAllModals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await erpFetchJson<AuthMeResponse>('auth/me');
        if (!cancelled) {
          setIsAdmin(res.user.roles.includes('ADMIN'));
        }
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!productMenuOpenId) return;
    const onClick = () => setProductMenuOpenId(null);
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [productMenuOpenId]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await erpFetchJson<ProductCategoryDto[]>('product-categories');
      setProductCategories(res);
    } catch {
      setProductCategories([]);
    }
  }, []);

  const buildSummaryQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    const { startDate, endDate } = resolveDashboardPeriodRange(
      dashboardPeriod,
      dashboardDateFrom,
      dashboardDateTo,
    );
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    return params;
  }, [dashboardPeriod, dashboardDateFrom, dashboardDateTo]);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setBannerError(null);
    try {
      const params = buildSummaryQueryParams();
      const res = await erpFetchJson<StockSummary>(
        `stock/summary?${params.toString()}`,
      );
      setSummary(res);
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Falha ao carregar resumo.');
    } finally {
      setSummaryLoading(false);
    }
  }, [buildSummaryQueryParams]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const skuParam = searchParams.get('sku');
    if (tabParam === 'inventory') {
      setTab('inventory');
    }
    if (skuParam) {
      setProductSearch(skuParam);
      setProductSearchDebounced(skuParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (tab === 'inventory' || tab === 'dashboard' || productModalOpen) {
      void loadCategories();
      void erpFetchJson<SupplierOption[]>('cadastros/suppliers')
        .then((rows) => setSuppliers(rows.filter((row) => row.isActive)))
        .catch(() => setSuppliers([]));
    }
  }, [tab, productModalOpen, loadCategories]);

  useEffect(() => {
    const t = setTimeout(() => setProductSearchDebounced(productSearch), 350);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearchDebounced]);

  const loadProducts = useCallback(
    async (opts: { page: number; lowStock?: boolean; allPages?: boolean }) => {
      setProductsLoading(true);
      setBannerError(null);
      try {
        const buildParams = (page: number, pageSize: number) => {
          const params = new URLSearchParams();
          params.set('page', String(page));
          params.set('pageSize', String(pageSize));
          if (productSearchDebounced.trim()) {
            params.set('search', productSearchDebounced.trim());
          }
          if (opts.lowStock) {
            params.set('lowStock', 'true');
            params.set('status', 'active');
          } else {
            params.set('status', isAdmin && showInactive ? 'all' : 'active');
          }
          params.set('sortBy', 'name');
          params.set('sortOrder', 'asc');
          return params;
        };

        if (opts.allPages) {
          const allRows: ProductDto[] = [];
          let page = 1;
          let totalPages = 1;
          do {
            const res = await erpFetchJson<Paginated<ProductDto>>(
              `products?${buildParams(page, 100).toString()}`,
            );
            allRows.push(...res.data);
            totalPages = res.meta.totalPages;
            page += 1;
          } while (page <= totalPages);

          setProductsData({
            data: allRows,
            meta: {
              page: 1,
              pageSize: allRows.length,
              total: allRows.length,
              totalPages: 1,
            },
          });
        } else {
          const res = await erpFetchJson<Paginated<ProductDto>>(
            `products?${buildParams(opts.page, 12).toString()}`,
          );
          setProductsData(res);
        }
      } catch (e) {
        setBannerError(e instanceof Error ? e.message : 'Falha ao carregar produtos.');
        setProductsData(null);
      } finally {
        setProductsLoading(false);
      }
    },
    [productSearchDebounced, isAdmin, showInactive],
  );

  const reloadProductsForTab = useCallback(async () => {
    if (tab === 'inventory') {
      await loadProducts({ page: 1, lowStock: false, allPages: true });
      return;
    }
    await loadProducts({ page: productPage, lowStock: false });
  }, [tab, productPage, loadProducts]);

  useEffect(() => {
    if (tab === 'inventory') {
      void loadProducts({ page: 1, lowStock: false, allPages: true });
    } else if (tab === 'dashboard') {
      void loadProducts({ page: productPage, lowStock: false });
    }
  }, [tab, productPage, loadProducts]);

  useEffect(() => {
    const t = setTimeout(() => setMoveFilterSearchDebounced(moveFilterSearch), 350);
    return () => clearTimeout(t);
  }, [moveFilterSearch]);

  const toggleMoveTypeCardFilter = useCallback((key: MoveTypeCardFilter) => {
    setMoveTypeCardFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const buildMovementQueryParams = useCallback(
    (opts?: {
      page?: number;
      pageSize?: number;
      includeTypeFilters?: boolean;
    }) => {
      const params = new URLSearchParams();
      params.set('page', String(opts?.page ?? 1));

      if (tab === 'movements') {
        params.set('pageSize', String(opts?.pageSize ?? 100));
        if (moveFilterSearchDebounced.trim()) {
          params.set('search', moveFilterSearchDebounced.trim());
        }
        if (opts?.includeTypeFilters !== false) {
          if (moveTypeCardFilters.size > 0) {
            params.set(
              'types',
              [...moveTypeCardFilters].sort().join(','),
            );
          } else {
            params.set('types', 'entrada,saida');
          }
        }
        if (moveFilterUserId) {
          params.set('userId', moveFilterUserId);
        }
        const { startDate, endDate } = resolveMovePeriodRange(
          moveFilterPeriod,
          moveFilterDateFrom,
          moveFilterDateTo,
        );
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
      } else {
        params.set('pageSize', String(opts?.pageSize ?? 50));
      }

      return params;
    },
    [
      tab,
      moveFilterSearchDebounced,
      moveTypeCardFilters,
      moveFilterUserId,
      moveFilterPeriod,
      moveFilterDateFrom,
      moveFilterDateTo,
    ],
  );

  const loadMovementsSummary = useCallback(async () => {
    if (tab !== 'movements') return;
    try {
      const params = buildMovementQueryParams({
        page: 1,
        pageSize: 1,
        includeTypeFilters: false,
      });
      const res = await erpFetchJson<MovementsSummary>(
        `stock/movements/summary?${params.toString()}`,
      );
      setMovementsSummary(res);
    } catch {
      setMovementsSummary(null);
    }
  }, [tab, buildMovementQueryParams]);

  const loadMovementUsers = useCallback(async () => {
    try {
      const users = await erpFetchJson<MovementUserOption[]>('auth/users');
      setMovementUsers(users);
    } catch {
      setMovementUsers([]);
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    setBannerError(null);
    try {
      if (tab === 'movements') {
        const allRows: MovementRow[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const params = buildMovementQueryParams({ page, pageSize: 100 });
          const res = await erpFetchJson<Paginated<MovementRow>>(
            `stock/movements?${params.toString()}`,
          );
          allRows.push(...res.data);
          totalPages = res.meta.totalPages;
          page += 1;
        } while (page <= totalPages);

        setMovementsData({
          data: allRows,
          meta: {
            total: allRows.length,
            page: 1,
            pageSize: allRows.length || 100,
            totalPages: 1,
          },
        });
        await loadMovementsSummary();
      } else {
        const params = buildMovementQueryParams();
        const res = await erpFetchJson<Paginated<MovementRow>>(
          `stock/movements?${params.toString()}`,
        );
        setMovementsData(res);
      }
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao carregar movimentações.',
      );
      setMovementsData(null);
      setMovementsSummary(null);
    } finally {
      setMovementsLoading(false);
    }
  }, [buildMovementQueryParams, tab, loadMovementsSummary]);

  useEffect(() => {
    if (tab === 'movements') {
      void loadMovementUsers();
    }
  }, [tab, loadMovementUsers]);

  useEffect(() => {
    if (tab !== 'movements') return;
    void loadMovementsSummary();
  }, [
    tab,
    loadMovementsSummary,
    moveFilterPeriod,
    moveFilterDateFrom,
    moveFilterDateTo,
    moveFilterSearchDebounced,
    moveFilterUserId,
  ]);

  useEffect(() => {
    if (tab === 'movements' || tab === 'inventory' || tab === 'dashboard') {
      void loadMovements();
    }
  }, [tab, loadMovements]);

  const openCreateProduct = () => {
    syncInventoryListScroll();
    setBannerSuccess(null);
    setProductModalMode('create');
    setEditingProduct(null);
    setForm(emptyForm);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: ProductDto) => {
    syncInventoryListScroll();
    setBannerSuccess(null);
    setProductModalMode('edit');
    setEditingProduct(p);
    setForm({
      sku: p.sku,
      name: p.name,
      categoryId: p.categoryId ?? '',
      price: p.price,
      cost: p.cost ?? '',
      minStock: String(p.minStock),
      supplierId: p.supplierId ?? '',
      supplierSku: p.supplierSku ?? '',
    });
    setProductModalOpen(true);
  };

  const parseMoneyToNumber = (raw: string): number => {
    const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
    return n;
  };

  const saveProduct = async () => {
    setFormSaving(true);
    setBannerSuccess(null);
    setBannerError(null);
    try {
      const sku = form.sku.trim();
      const name = form.name.trim();
      const costStr = form.cost.trim();
      const cid = form.categoryId.trim();

      if (!sku || !name) {
        setBannerError('Preencha SKU e nome do produto.');
        return;
      }

      const priceNum = parseMoneyToNumber(form.price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setBannerError('Informe um preço válido (número ≥ 0).');
        return;
      }

      const minStockParsed = Number.parseInt(String(form.minStock).trim(), 10);
      const minStock = Number.isFinite(minStockParsed) ? Math.max(0, minStockParsed) : 0;

      const createPayload: Record<string, string | number> = {
        sku,
        name,
        price: Number(priceNum.toFixed(2)),
        minStock,
      };

      if (cid.length > 0) {
        createPayload.categoryId = cid;
      }

      if (costStr.length > 0) {
        const costNum = parseMoneyToNumber(costStr);
        if (!Number.isFinite(costNum) || costNum < 0) {
          setBannerError('Informe um custo válido ou deixe em branco.');
          return;
        }
        createPayload.cost = Number(costNum.toFixed(2));
      }

      const supplierId = form.supplierId.trim();
      if (supplierId.length > 0) {
        createPayload.supplierId = supplierId;
      }
      const supplierSku = form.supplierSku.trim();
      if (supplierSku.length > 0) {
        createPayload.supplierSku = supplierSku;
      }

      if (productModalMode === 'create') {
        await erpFetchJson('products', {
          method: 'POST',
          body: JSON.stringify(createPayload),
        });
      } else if (editingProduct) {
        const patch: Record<string, string | number | null> = {
          sku,
          name,
          price: Number(priceNum.toFixed(2)),
          minStock,
          categoryId: cid.length > 0 ? cid : null,
        };
        if (costStr.length > 0) {
          patch.cost = Number(parseMoneyToNumber(costStr).toFixed(2));
        } else {
          patch.cost = null;
        }
        patch.supplierId = supplierId.length > 0 ? supplierId : null;
        patch.supplierSku = supplierSku.length > 0 ? supplierSku : null;

        await erpFetchJson(`products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      }

      setProductModalOpen(false);
      await loadSummary();
      if (tab === 'inventory' || tab === 'dashboard') await reloadProductsForTab();
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Erro ao salvar produto.');
    } finally {
      setFormSaving(false);
    }
  };

  const inactivateProduct = async (p: ProductDto) => {
    setProductDeleteTarget(p);
  };

  const cancelProductDelete = () => {
    if (productDeleting) return;
    setProductDeleteTarget(null);
  };

  const executeProductDelete = async () => {
    if (!productDeleteTarget) return;
    setProductDeleting(true);
    setBannerError(null);
    try {
      await erpFetchJson(`products/${productDeleteTarget.id}`, {
        method: 'DELETE',
      });
      if (selectedInventoryId === productDeleteTarget.id) {
        setSelectedInventoryId(null);
      }
      setProductMenuOpenId(null);
      cancelProductDelete();
      setBannerSuccess(
        `Produto "${productDeleteTarget.name}" excluído com sucesso.`,
      );
      await loadSummary();
      await reloadProductsForTab();
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao excluir produto.',
      );
    } finally {
      setProductDeleting(false);
    }
  };

  const toggleProductActive = async (p: ProductDto) => {
    setProductMenuOpenId(null);
    setBannerSuccess(null);
    setBannerError(null);
    setTogglingProductId(p.id);
    try {
      await erpFetchJson(`products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      setBannerSuccess(
        p.isActive
          ? `Produto "${p.name}" desativado.`
          : `Produto "${p.name}" reativado.`,
      );
      await loadSummary();
      await reloadProductsForTab();
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Erro ao alterar status do produto.',
      );
    } finally {
      setTogglingProductId(null);
    }
  };

  const openMoveModal = async (kind: MovementKind, presetProduct?: ProductDto) => {
    syncInventoryListScroll();
    setBannerError(null);
    setBannerSuccess(null);
    setMoveNotesError(null);
    setMoveConfirmOpen(false);
    setMoveConfirmMessages([]);
    setPendingPresetAjustePlan(null);
    setMovePresetProduct(presetProduct ?? null);
    setMoveForm({
      productId: presetProduct?.id ?? '',
      movementKind: kind,
      quantity:
        presetProduct != null
          ? kind === 'ajuste'
            ? String(presetProduct.stockQty)
            : '0'
          : '0',
      notes: '',
      cost: presetProduct?.cost ?? '',
      price: presetProduct?.price ?? '',
    });
    if (presetProduct) {
      setProductPicker([]);
      setMoveModalOpen(true);
      return;
    }
    try {
      const res = await erpFetchJson<Paginated<ProductDto>>(
        'products?status=active&pageSize=50&sortBy=name&sortOrder=asc',
      );
      setProductPicker(res.data);
    } catch {
      setProductPicker([]);
    }
    setMoveModalOpen(true);
  };

  const buildPresetAjustePlan = () => {
    if (!movePresetProduct) return null;

    const messages: string[] = [];
    const productPatch: Record<string, number> = {};
    const movements: Array<{
      movementType: string;
      quantity: number;
      notes: string;
      reference?: string;
    }> = [];
    const notes = moveForm.notes.trim();

    const qtyTrimmed = moveForm.quantity.trim();
    if (!/^\d+$/.test(qtyTrimmed)) {
      throw new Error('Informe uma quantidade válida.');
    }
    const newQty = Number.parseInt(qtyTrimmed, 10);
    const oldQty = movePresetProduct.stockQty;
    if (newQty !== oldQty) {
      const delta = newQty - oldQty;
      messages.push(
        `Você está alterando a quantidade de ${oldQty} para ${newQty}. Confirma?`,
      );
      movements.push({
        movementType: 'AJUSTE_QUANTIDADE',
        quantity: delta,
        notes,
      });
    }

    const priceNum = parseMoneyToNumber(moveForm.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      throw new Error('Informe um preço de venda válido.');
    }
    const origPrice = Number(movePresetProduct.price);
    if (Number(priceNum.toFixed(2)) !== Number(origPrice.toFixed(2))) {
      productPatch.price = Number(priceNum.toFixed(2));
      messages.push(
        `Você está alterando o preço de venda de ${formatBrl(movePresetProduct.price)} para ${formatBrl(String(priceNum))}. Confirma?`,
      );
      movements.push({
        movementType: 'AJUSTE_PRECO_VENDA',
        quantity: 0,
        notes,
        reference: formatPriceChangeReference(origPrice, priceNum),
      });
    }

    const costStr = moveForm.cost.trim();
    if (costStr.length > 0) {
      const costNum = parseMoneyToNumber(costStr);
      if (!Number.isFinite(costNum) || costNum < 0) {
        throw new Error('Informe um preço base válido.');
      }
      const origCost =
        movePresetProduct.cost != null ? Number(movePresetProduct.cost) : null;
      const origCostLabel =
        origCost != null ? formatBrl(movePresetProduct.cost!) : '—';
      if (
        origCost === null ||
        Number(costNum.toFixed(2)) !== Number(origCost.toFixed(2))
      ) {
        productPatch.cost = Number(costNum.toFixed(2));
        messages.push(
          `Você está alterando o preço base de ${origCostLabel} para ${formatBrl(String(costNum))}. Confirma?`,
        );
        movements.push({
          movementType: 'AJUSTE_PRECO_BASE',
          quantity: 0,
          notes,
          reference: formatPriceChangeReference(origCost ?? 0, costNum),
        });
      }
    }

    if (messages.length === 0) {
      throw new Error('Nenhuma alteração detectada.');
    }

    return { messages, productPatch, movements };
  };

  const executePresetAjustePlan = async (
    plan: NonNullable<typeof pendingPresetAjustePlan>,
  ) => {
    if (Object.keys(plan.productPatch).length > 0 && movePresetProduct) {
      await erpFetchJson(`products/${movePresetProduct.id}`, {
        method: 'PATCH',
        body: JSON.stringify(plan.productPatch),
      });
    }

    for (const movement of plan.movements) {
      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: moveForm.productId,
          movementType: movement.movementType,
          quantity: movement.quantity,
          notes: movement.notes,
          reference: movement.reference,
        }),
      });
    }
  };

  const finalizeMovementSave = async () => {
    setMoveModalOpen(false);
    setMoveConfirmOpen(false);
    setMovePresetProduct(null);
    setPendingPresetAjustePlan(null);
    setMoveConfirmMessages([]);
    setBannerError(null);
    setBannerSuccess('Movimentação registrada com sucesso.');
    await loadSummary();
    await loadMovements();
    if (tab === 'inventory' || tab === 'dashboard') {
      await reloadProductsForTab();
    }
  };

  const requestSaveMovement = () => {
    setMoveNotesError(null);
    setBannerError(null);

    if (moveForm.movementKind === 'ajuste' && !moveForm.notes.trim()) {
      setMoveNotesError('Informe o motivo do ajuste');
      return;
    }

    if (!moveForm.productId) {
      setBannerError('Selecione um produto.');
      return;
    }

    if (moveForm.movementKind !== 'ajuste') {
      void saveMovement();
      return;
    }

    if (movePresetProduct) {
      try {
        const plan = buildPresetAjustePlan();
        if (!plan) return;
        setPendingPresetAjustePlan(plan);
        setMoveConfirmMessages(plan.messages);
        syncInventoryListScroll();
        setMoveConfirmOpen(true);
      } catch (e) {
        setBannerError(
          e instanceof Error ? e.message : 'Erro ao validar ajuste.',
        );
      }
      return;
    }

    void saveMovement();
  };

  const confirmPresetAjusteSave = async () => {
    if (!pendingPresetAjustePlan) return;
    setMoveSaving(true);
    setBannerError(null);
    try {
      await executePresetAjustePlan(pendingPresetAjustePlan);
      await finalizeMovementSave();
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Erro ao registrar movimentação.',
      );
    } finally {
      setMoveSaving(false);
    }
  };

  const saveMovement = async () => {
    setMoveSaving(true);
    setBannerError(null);
    setBannerSuccess(null);
    setMoveNotesError(null);
    try {
      if (moveForm.movementKind === 'ajuste' && !moveForm.notes.trim()) {
        setMoveNotesError('Informe o motivo do ajuste');
        return;
      }

      const trimmed = moveForm.quantity.trim();
      const qtyRaw = (() => {
        if (!trimmed) return Number.NaN;
        if (moveForm.movementKind === 'ajuste' && !movePresetProduct) {
          if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
          return Number.parseInt(trimmed, 10);
        }
        if (!/^\d+$/.test(trimmed)) return Number.NaN;
        return Number.parseInt(trimmed, 10);
      })();
      if (
        Number.isNaN(qtyRaw) ||
        (moveForm.movementKind !== 'ajuste' && qtyRaw <= 0) ||
        (moveForm.movementKind === 'ajuste' &&
          !movePresetProduct &&
          qtyRaw === 0)
      ) {
        throw new Error('Informe uma quantidade válida.');
      }

      if (!moveForm.productId) {
        throw new Error('Selecione um produto.');
      }

      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: moveForm.productId,
          movementKind: moveForm.movementKind,
          movementType: MOVEMENT_KIND_TO_TYPE[moveForm.movementKind],
          quantity: qtyRaw,
          ...(moveForm.notes.trim()
            ? { notes: moveForm.notes.trim() }
            : {}),
        }),
      });
      await finalizeMovementSave();
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Erro ao registrar movimentação.',
      );
    } finally {
      setMoveSaving(false);
    }
  };

  const productRows: TableRow[] = useMemo(() => {
    if (!productsData) return [];
    return productsData.data.map((p) => ({
      id: p.id,
      values: {
        sku: p.sku,
        name: p.name,
        category: p.category ?? '—',
        price: formatBrl(p.price),
        stockQty: String(p.stockQty),
        minStock: String(p.minStock),
      },
      status: {
        label: p.isActive ? 'Ativo' : 'Inativo',
        tone: p.isActive ? 'success' : 'neutral',
      },
    }));
  }, [productsData]);

  const productTableColumns: TableColumn[] = useMemo(
    () => [
      { key: 'sku', header: 'SKU' },
      { key: 'name', header: 'Produto', className: 'min-w-[140px]' },
      {
        key: 'category',
        header: 'Categoria',
        className: 'min-w-[120px] max-w-[220px]',
        renderCell: ({ rowId }) => (
          <ProductCategoryCell
            product={productsData?.data.find((x) => x.id === rowId)}
          />
        ),
      },
      { key: 'price', header: 'Preço' },
      { key: 'stockQty', header: 'Estoque' },
      { key: 'minStock', header: 'Mínimo' },
    ],
    [productsData],
  );

  const clearMovementFilters = () => {
    setMoveFilterSearch('');
    setMoveFilterSearchDebounced('');
    setMoveTypeCardFilters(new Set());
    setMoveFilterUserId('');
    setMoveFilterPeriod('month');
    setMoveFilterDateFrom('');
    setMoveFilterDateTo('');
  };

  const exportMovementsCsv = async () => {
    setMovementsExporting(true);
    setBannerError(null);
    try {
      const allRows: MovementRow[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const params = buildMovementQueryParams({ page, pageSize: 100 });
        const res = await erpFetchJson<Paginated<MovementRow>>(
          `stock/movements?${params.toString()}`,
        );
        allRows.push(...res.data);
        totalPages = res.meta.totalPages;
        page += 1;
      } while (page <= totalPages);

      const header = [
        'Data',
        'Tipo',
        'Pedido',
        'NF',
        'Produto',
        'SKU',
        'Quantidade',
        'Alteração de preço',
        'Responsável',
        'Observação',
      ];
      const lines = allRows.map((m) => {
        const typeLabel = MOVEMENT_LABEL[m.movementType] ?? m.movementType;
        const priceChange = parsePriceChangeLabel(m.reference, m.movementType);
        const { pedido, nf } = parseMovementOrderRefs(m);
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
        return [
          esc(formatDateTime(m.movementDate)),
          esc(typeLabel),
          esc(pedido),
          esc(nf),
          esc(m.product.name),
          esc(m.product.sku),
          esc(String(m.quantity)),
          esc(priceChange),
          esc(m.movedBy?.name ?? '—'),
          esc(m.notes ?? '—'),
        ].join(';');
      });
      const csv = `\uFEFF${header.join(';')}\n${lines.join('\n')}`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `movimentacoes-estoque-${todayIsoDate()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao exportar movimentações.',
      );
    } finally {
      setMovementsExporting(false);
    }
  };

  const openMovementDelete = (movement: MovementRow) => {
    setBannerError(null);
    setMovementDeleteTarget(movement);
    setMovementDeleteStep('confirm');
  };

  const cancelMovementDelete = () => {
    setMovementDeleteTarget(null);
    setMovementDeleteStep('idle');
  };

  const executeMovementDelete = async () => {
    if (!movementDeleteTarget) return;
    setMovementDeleting(true);
    setBannerError(null);
    try {
      await erpFetchJson(`stock/movements/${movementDeleteTarget.id}`, {
        method: 'DELETE',
      });
      cancelMovementDelete();
      setBannerSuccess('Movimentação excluída com sucesso.');
      await loadSummary();
      await loadMovements();
      if (tab === 'inventory' || tab === 'dashboard') {
        await reloadProductsForTab();
      }
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao excluir movimentação.',
      );
    } finally {
      setMovementDeleting(false);
    }
  };

  const renderMovementDeleteButton = (movement: MovementRow) => {
    if (!isAdmin) return null;
    return (
      <button
        type="button"
        aria-label="Excluir movimentação"
        disabled={movementDeleting}
        onClick={() => openMovementDelete(movement)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-rose-400 transition hover:border-rose-400/30 hover:bg-rose-500/10 disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  };

  const cancelReserveFromRow = async (movement: MovementRow) => {
    setCancelingReserveId(movement.id);
    setBannerError(null);
    try {
      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: movement.product.id,
          movementType: 'RESERVE_CANCEL',
          quantity: movement.quantity,
          ...(movement.reference?.trim()
            ? { reference: movement.reference.trim() }
            : {}),
          notes: `Cancelamento de reserva (${movement.product.sku})`,
        }),
      });
      setBannerSuccess('Reserva cancelada com sucesso.');
      await loadSummary();
      await loadMovements();
      if (tab === 'inventory' || tab === 'dashboard') {
        await reloadProductsForTab();
      }
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao cancelar reserva.',
      );
    } finally {
      setCancelingReserveId(null);
    }
  };

  const renderMovementRowActions = (movement: MovementRow) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {movement.movementType === 'RESERVE' ? (
        <button
          type="button"
          disabled={cancelingReserveId === movement.id}
          onClick={() => void cancelReserveFromRow(movement)}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-400/30 px-2 py-1 text-[11px] font-semibold text-violet-600 transition hover:bg-violet-500/10 disabled:opacity-50"
        >
          {cancelingReserveId === movement.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Undo2 className="h-3 w-3" />
          )}
          Cancelar reserva
        </button>
      ) : null}
      {renderMovementDeleteButton(movement)}
    </div>
  );

  const openReserveModal = async () => {
    if (!selectedInventoryProduct) return;
    setReserveError(null);
    setReserveStep('form');
    setReserveForm({ receiverId: '', quantity: '', notes: '' });
    try {
      const rows = await erpFetchJson<CadastroOption[]>('cadastros/receivers');
      setReserveReceivers(rows.filter((r) => r.isActive));
    } catch {
      setReserveReceivers([]);
    }
    setReserveOpen(true);
  };

  const closeReserveModal = () => {
    if (reserveSaving) return;
    setReserveOpen(false);
    setReserveStep('form');
    setReserveError(null);
  };

  const requestReserveConfirm = () => {
    setReserveError(null);
    if (!selectedInventoryProduct) {
      setReserveError('Selecione um produto.');
      return;
    }
    if (!reserveForm.receiverId.trim()) {
      setReserveError('Selecione o recebedor.');
      return;
    }
    const qty = Number.parseInt(reserveForm.quantity.trim(), 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setReserveError('Informe uma quantidade válida.');
      return;
    }
    setReserveStep('confirm');
  };

  const executeReserveSave = async () => {
    if (!selectedInventoryProduct) return;
    const receiver = reserveReceivers.find((r) => r.id === reserveForm.receiverId);
    if (!receiver) {
      setReserveError('Recebedor inválido.');
      setReserveStep('form');
      return;
    }
    const qty = Number.parseInt(reserveForm.quantity.trim(), 10);
    if (!Number.isFinite(qty) || qty <= 0) {
      setReserveError('Informe uma quantidade válida.');
      setReserveStep('form');
      return;
    }

    setReserveSaving(true);
    setReserveError(null);
    try {
      const notesParts = [
        `Reserva para ${receiver.name}`,
        reserveForm.notes.trim(),
      ].filter(Boolean);

      await erpFetchJson('stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          productId: selectedInventoryProduct.id,
          movementType: 'RESERVE',
          quantity: qty,
          reference: receiver.name,
          notes: notesParts.join(' — '),
        }),
      });
      closeReserveModal();
      setBannerSuccess('Reserva registrada com sucesso.');
      await loadSummary();
      await loadMovements();
      await reloadProductsForTab();
    } catch (e) {
      setReserveError(
        e instanceof Error ? e.message : 'Falha ao registrar reserva.',
      );
      setReserveStep('form');
    } finally {
      setReserveSaving(false);
    }
  };

  const movementTableColumns: TableColumn[] = useMemo(() => {
    const allColumns = movementColumnsBase.map((col) => {
      if (col.key === 'status') {
        return {
          ...col,
          renderCell: ({ value, rowId }: { value: string; rowId: string }) => {
            const item = movementsData?.data.find((m) => m.id === rowId);
            const type = item?.movementType ?? '';
            return (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${movementBadgeClass(type)}`}
              >
                {value}
              </span>
            );
          },
        };
      }
      if (col.key === 'pedido' || col.key === 'nf') {
        return {
          ...col,
          renderCell: ({ value }: { value: string }) =>
            value !== '—' ? (
              <span className="font-semibold text-[var(--accent)]">{value}</span>
            ) : (
              <span className="text-[var(--text-muted)]">—</span>
            ),
        };
      }
      return col;
    });
    return movementColumnPrefs.applyToColumns(allColumns);
  }, [movementsData, movementColumnPrefs.preferences, movementColumnPrefs.applyToColumns]);

  const movementRows: TableRow[] = useMemo(() => {
    if (!movementsData) return [];
    return movementsData.data.map((m) => {
      const { pedido, nf } = parseMovementOrderRefs(m);
      return {
        id: m.id,
        values: {
          dataPedido: formatDateTime(m.movementDate),
          status: MOVEMENT_LABEL[m.movementType] ?? m.movementType,
          pedido,
          nf,
          recebedor: '—',
          pontoDescarga: '—',
          transportadora: '—',
          dataEntrega: '—',
          valor: '—',
          product: `${m.product.name} (${m.product.sku})`,
          qty: String(m.quantity),
          user: m.movedBy?.name ?? '—',
        },
      };
    });
  }, [movementsData]);

  const movementItems = useMemo(() => movementsData?.data ?? [], [movementsData]);

  const inventoryProducts = useMemo(() => {
    // Usuário comum nunca vê produtos inativos, mesmo que a API os retorne.
    let base = (productsData?.data ?? []).filter(
      (p) => p.isActive || isAdmin,
    );
    if (inventorySupplierFilterId) {
      base = base.filter((p) => p.supplierId === inventorySupplierFilterId);
    }
    if (inventoryCategoryFilterId) {
      base = base.filter((p) => p.categoryId === inventoryCategoryFilterId);
    }
    if (inventoryFilter === 'all') return base;
    if (inventoryFilter === 'out') return base.filter((p) => p.stockQty <= 0);
    if (inventoryFilter === 'low') {
      return base.filter((p) => p.stockQty > 0 && p.stockQty <= p.minStock);
    }
    return base.filter(
      (p) =>
        (p.reservedQty ?? 0) > 0 ||
        movementItems.some(
          (m) =>
            m.product.id === p.id &&
            (m.movementType === 'RESERVE' || m.movementType === 'RESERVA'),
        ),
    );
  }, [
    productsData,
    isAdmin,
    inventoryFilter,
    inventorySupplierFilterId,
    inventoryCategoryFilterId,
    movementItems,
  ]);

  const selectedInventorySupplierName = useMemo(() => {
    if (!inventorySupplierFilterId) return null;
    return (
      suppliers.find((s) => s.id === inventorySupplierFilterId)?.name ?? null
    );
  }, [inventorySupplierFilterId, suppliers]);

  const selectedInventoryCategory = useMemo(() => {
    if (!inventoryCategoryFilterId) return null;
    return (
      productCategories.find((c) => c.id === inventoryCategoryFilterId) ?? null
    );
  }, [inventoryCategoryFilterId, productCategories]);

  const filteredSupplierOptions = useMemo(() => {
    const q = supplierFilterSearch.trim().toLowerCase();
    const sorted = [...suppliers].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
    if (!q) return sorted;
    return sorted.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, supplierFilterSearch]);

  const filteredCategoryOptions = useMemo(() => {
    const q = categoryFilterSearch.trim().toLowerCase();
    const sorted = [...productCategories]
      .filter((c) => c.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [productCategories, categoryFilterSearch]);

  const inventoryFilterBadges = useMemo((): FilterBadgeItem[] => {
    const badges: FilterBadgeItem[] = [];
    if (inventoryFilter !== 'all') {
      badges.push({
        key: `stock:${inventoryFilter}`,
        label: INVENTORY_FILTER_LABEL[inventoryFilter as Exclude<InventoryFilter, 'all'>],
      });
    }
    if (showInactive) {
      badges.push({ key: 'inactive', label: 'Inativos' });
    }
    if (inventorySupplierFilterId) {
      badges.push({
        key: 'supplier',
        label: `Fornecedor: ${selectedInventorySupplierName ?? inventorySupplierFilterId}`,
      });
    }
    if (inventoryCategoryFilterId && selectedInventoryCategory) {
      badges.push({
        key: 'category',
        label: `Categoria: ${selectedInventoryCategory.name}`,
        style: selectedInventoryCategory.color
          ? {
              borderColor: `${selectedInventoryCategory.color}55`,
              backgroundColor: `${selectedInventoryCategory.color}18`,
            }
          : undefined,
      });
    }
    const q = productSearchDebounced.trim();
    if (q) badges.push({ key: 'search', label: `Busca: ${q}` });
    return badges;
  }, [
    inventoryFilter,
    showInactive,
    inventorySupplierFilterId,
    inventoryCategoryFilterId,
    selectedInventorySupplierName,
    selectedInventoryCategory,
    productSearchDebounced,
  ]);

  const inventoryFilterPreset = useMemo(
    (): InventoryFilterPreset => ({
      inventoryFilter,
      showInactive,
      search: productSearch,
      supplierId: inventorySupplierFilterId,
      categoryId: inventoryCategoryFilterId,
    }),
    [
      inventoryFilter,
      showInactive,
      productSearch,
      inventorySupplierFilterId,
      inventoryCategoryFilterId,
    ],
  );

  const movementFilterBadges = useMemo((): FilterBadgeItem[] => {
    const badges: FilterBadgeItem[] = [];
    for (const type of [...moveTypeCardFilters].sort()) {
      badges.push({ key: `type:${type}`, label: MOVE_TYPE_LABEL[type] });
    }
    if (moveFilterUserId) {
      const user = movementUsers.find((u) => u.id === moveFilterUserId);
      badges.push({
        key: 'user',
        label: `Responsável: ${user?.name ?? moveFilterUserId}`,
      });
    }
    if (moveFilterPeriod !== 'week') {
      badges.push({
        key: 'period',
        label: MOVE_PERIOD_LABEL[moveFilterPeriod],
      });
    }
    if (moveFilterPeriod === 'custom') {
      if (moveFilterDateFrom) {
        badges.push({ key: 'dateFrom', label: `De: ${moveFilterDateFrom}` });
      }
      if (moveFilterDateTo) {
        badges.push({ key: 'dateTo', label: `Até: ${moveFilterDateTo}` });
      }
    }
    const q = moveFilterSearchDebounced.trim();
    if (q) badges.push({ key: 'search', label: `Busca: ${q}` });
    return badges;
  }, [
    moveTypeCardFilters,
    moveFilterUserId,
    movementUsers,
    moveFilterPeriod,
    moveFilterDateFrom,
    moveFilterDateTo,
    moveFilterSearchDebounced,
  ]);

  const movementFilterPreset = useMemo(
    (): MovementFilterPreset => ({
      search: moveFilterSearch,
      types: [...moveTypeCardFilters],
      userId: moveFilterUserId,
      period: moveFilterPeriod,
      dateFrom: moveFilterDateFrom,
      dateTo: moveFilterDateTo,
    }),
    [
      moveFilterSearch,
      moveTypeCardFilters,
      moveFilterUserId,
      moveFilterPeriod,
      moveFilterDateFrom,
      moveFilterDateTo,
    ],
  );

  const hasInventoryFilters =
    inventoryFilter !== 'all' ||
    showInactive ||
    inventorySupplierFilterId !== '' ||
    inventoryCategoryFilterId !== '' ||
    productSearchDebounced.trim().length > 0;

  const hasMovementFilters =
    moveTypeCardFilters.size > 0 ||
    moveFilterUserId !== '' ||
    moveFilterPeriod !== 'week' ||
    moveFilterDateFrom !== '' ||
    moveFilterDateTo !== '' ||
    moveFilterSearchDebounced.trim().length > 0;

  const removeInventoryFilterBadge = (key: string) => {
    if (key.startsWith('stock:')) {
      setInventoryFilter('all');
      return;
    }
    if (key === 'supplier') {
      setInventorySupplierFilterId('');
      setProductPage(1);
      return;
    }
    if (key === 'category') {
      setInventoryCategoryFilterId('');
      setProductPage(1);
      return;
    }
    if (key === 'inactive') {
      setShowInactive(false);
      setProductPage(1);
      return;
    }
    if (key === 'search') setProductSearch('');
  };

  const clearInventoryFilters = () => {
    setInventoryFilter('all');
    setShowInactive(false);
    setInventorySupplierFilterId('');
    setInventoryCategoryFilterId('');
    setProductSearch('');
    setProductPage(1);
  };

  const removeMovementFilterBadge = (key: string) => {
    if (key.startsWith('type:')) {
      const type = key.replace('type:', '') as MoveTypeCardFilter;
      setMoveTypeCardFilters((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
      return;
    }
    if (key === 'user') {
      setMoveFilterUserId('');
      return;
    }
    if (key === 'period') {
      setMoveFilterPeriod('month');
      return;
    }
    if (key === 'dateFrom') setMoveFilterDateFrom('');
    if (key === 'dateTo') setMoveFilterDateTo('');
    if (key === 'search') setMoveFilterSearch('');
  };

  useEffect(() => {
    if (inventoryProducts.length === 0) {
      setSelectedInventoryId(null);
      return;
    }
    if (
      selectedInventoryId !== null &&
      !inventoryProducts.some((p) => p.id === selectedInventoryId)
    ) {
      setSelectedInventoryId(inventoryProducts[0].id);
    }
  }, [inventoryProducts, selectedInventoryId]);

  const selectedInventoryProduct = useMemo(
    () => inventoryProducts.find((p) => p.id === selectedInventoryId) ?? null,
    [inventoryProducts, selectedInventoryId],
  );

  const selectedMovements = useMemo(() => {
    if (!selectedInventoryProduct) return [];
    return movementItems
      .filter((m) => m.product.id === selectedInventoryProduct.id)
      .sort((a, b) => +new Date(b.movementDate) - +new Date(a.movementDate))
      .slice(0, 10);
  }, [selectedInventoryProduct, movementItems]);

  const selectedProductMovementsAll = useMemo(() => {
    if (!selectedInventoryProduct) return [];
    return movementItems.filter((m) => m.product.id === selectedInventoryProduct.id);
  }, [selectedInventoryProduct, movementItems]);

  const selectedMovementStats = useMemo(() => {
    const now = Date.now();
    const recent = movementItems.filter(
      (m) =>
        selectedInventoryProduct &&
        m.product.id === selectedInventoryProduct.id &&
        now - new Date(m.movementDate).getTime() < 1000 * 60 * 60 * 24 * 30,
    );
    const inbound = recent
      .filter((m) => m.movementType === 'INBOUND')
      .reduce((acc, m) => acc + m.quantity, 0);
    const outbound = recent
      .filter((m) => m.movementType === 'OUTBOUND')
      .reduce((acc, m) => acc + m.quantity, 0);
    return { inbound, outbound };
  }, [movementItems, selectedInventoryProduct]);

  const selectedGaugeMax = useMemo(() => {
    if (!selectedInventoryProduct) {
      return { inMax: 500, outMax: 500, availableMax: 1, minMax: 1 };
    }
    const inPeak = Math.max(
      0,
      ...selectedProductMovementsAll
        .filter((m) => m.movementType === 'INBOUND')
        .map((m) => m.quantity),
    );
    const outPeak = Math.max(
      0,
      ...selectedProductMovementsAll
        .filter((m) => m.movementType === 'OUTBOUND')
        .map((m) => m.quantity),
    );
    const availableMax = Math.max(1, selectedInventoryProduct.stockQty);
    const minMax = Math.max(1, selectedInventoryProduct.stockQty);
    return {
      inMax: inPeak > 0 ? inPeak : 500,
      outMax: outPeak > 0 ? outPeak : 500,
      availableMax,
      minMax,
    };
  }, [selectedInventoryProduct, selectedProductMovementsAll]);

  const selectedPriceLine = useMemo(() => {
    if (!selectedInventoryProduct) {
      return { basePrice: '—', salePrice: '—', totalValue: '—' };
    }
    const source = selectedInventoryProduct as unknown as Record<string, unknown>;
    const basePrice = formatPriceFromCandidates(source, [
      'basePrice',
      'costPrice',
      'purchasePrice',
      'cost',
    ]);
    const salePrice = formatPriceFromCandidates(source, [
      'salePrice',
      'sellingPrice',
      'price',
    ]);

    let totalValue = '—';
    if ('totalValue' in source) {
      totalValue = formatPriceFromCandidates(source, ['totalValue']);
    } else if (basePrice !== '—') {
      const rawBase =
        source.basePrice ??
        source.costPrice ??
        source.purchasePrice ??
        source.cost;
      const n = Number(rawBase ?? 0);
      totalValue = formatBrl(
        String(
          Math.max(
            0,
            selectedInventoryProduct.stockQty * (Number.isNaN(n) ? 0 : n),
          ),
        ),
      );
    }

    return { basePrice, salePrice, totalValue };
  }, [selectedInventoryProduct]);

  const dashboardBars = useMemo(() => {
    return (summary?.dailyFlow ?? []).map((d) => ({
      date: d.date.slice(5),
      in: d.inbound,
      out: d.outbound,
    }));
  }, [summary]);

  const entriesInPeriod = summary?.periodInboundCount ?? 0;

  const stockTrend30 = useMemo(() => {
    return (summary?.stockTrend ?? []).map((p) => ({
      label: p.date.slice(5),
      value: p.value,
    }));
  }, [summary]);

  const dashboardTopMoved = summary?.topMoved ?? [];

  const dashboardStagnant = summary?.stagnantProducts ?? [];

  const dashboardCritical = summary?.criticalProducts ?? [];

  const dashboardTopInbound = summary?.topInboundMovements ?? [];

  const dashboardPeriodSuffix = dashboardSectionPeriodSuffix(
    dashboardPeriod,
    dashboardDateFrom,
    dashboardDateTo,
  );
  const dashboardCustomDateActive = hasDashboardCustomDateRange(
    dashboardDateFrom,
    dashboardDateTo,
  );

  const clearDashboardFilters = () => {
    setDashboardPeriod('month');
    setDashboardDateFrom('');
    setDashboardDateTo('');
  };

  const dashboardBarMax = useMemo(
    () => Math.max(1, ...dashboardBars.map((d) => Math.max(d.in, d.out))),
    [dashboardBars],
  );

  const stockTrendChart = useMemo(() => {
    const width = 640;
    const height = 160;
    const min = Math.min(...stockTrend30.map((p) => p.value), summary?.totalUnitsOnHand ?? 0);
    const max = Math.max(...stockTrend30.map((p) => p.value), summary?.totalUnitsOnHand ?? 0, min + 1);
    const pad = 18;
    const plotW = width - pad * 2;
    const plotH = height - pad * 2;
    const scaleX = (i: number) => pad + (i / Math.max(1, stockTrend30.length - 1)) * plotW;
    const scaleY = (v: number) => pad + ((max - v) / (max - min || 1)) * plotH;
    const points = stockTrend30.map((p, i) => `${scaleX(i)},${scaleY(p.value)}`).join(' ');
    const firstX = stockTrend30.length > 0 ? scaleX(0) : pad;
    const lastX = stockTrend30.length > 0 ? scaleX(stockTrend30.length - 1) : width - pad;
    const area = `${firstX},${height - pad} ${points} ${lastX},${height - pad}`;
    return { width, height, pad, points, area, min, max };
  }, [stockTrend30, summary]);

  const productSelectOptions = useMemo(
    () =>
      productPicker.map((p) => ({
        value: p.id,
        label: `${p.name} — ${p.sku} (saldo ${p.stockQty})`,
      })),
    [productPicker],
  );

  const openInventoryForSku = (sku: string) => {
    setTab('inventory');
    setProductSearch(sku);
    setProductSearchDebounced(sku);
    setProductPage(1);
    router.push(`/app/estoque?tab=inventory&sku=${encodeURIComponent(sku)}`);
  };

  const tabButton = (id: TabId, label: string, icon: ReactNode) => (
    <button
      type="button"
      key={id}
      onClick={() => {
        setTab(id);
        setProductPage(1);
        setBannerSuccess(null);
        setBannerError(null);
      }}
      className={`flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${
        tab === id
          ? 'border-transparent bg-[var(--accent)] text-white'
          : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const inventoryDetailPanelContent = selectedInventoryProduct ? (
    <>
      <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#1e2130]">
            <Package className="h-7 w-7 text-[#5b5ef4]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-[var(--text-primary)]">
              SKU #{selectedInventoryProduct.sku} — {selectedInventoryProduct.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
              <span className="text-[var(--text-secondary)]">Fornecedor:</span>
              <span className="text-[var(--text-primary)]">
                {selectedInventoryProduct.supplierName?.trim() || 'Não informado'}
              </span>
              <span className="text-[var(--text-secondary)]">|</span>
              <ProductCategoryCell product={selectedInventoryProduct} />
              <span className="text-[var(--text-secondary)]">|</span>
              <span className="text-[var(--text-secondary)]">SKU fornecedor:</span>
              <span className="text-[var(--text-primary)]">
                {selectedInventoryProduct.supplierSku?.trim() || '—'}
              </span>
            </p>
          </div>
          {isAdmin ? (
            <button
              type="button"
              aria-label={`Excluir produto ${selectedInventoryProduct.name}`}
              disabled={productDeleting}
              onClick={() => inactivateProduct(selectedInventoryProduct)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-rose-400 transition hover:border-rose-400/30 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GlowButton variant="secondary" onClick={() => openEditProduct(selectedInventoryProduct)}>
          <Pencil className="h-4 w-4" />
          Editar item
        </GlowButton>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span
          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
            selectedInventoryProduct.stockQty <= 0
              ? 'border border-rose-300 bg-rose-500/10 text-rose-500'
              : selectedInventoryProduct.stockQty <= selectedInventoryProduct.minStock
                ? 'border border-amber-300 bg-amber-500/10 text-amber-600'
                : 'border border-[#86efac] bg-[#dcfce7] text-[#16a34a]'
          }`}
        >
          {selectedInventoryProduct.stockQty <= 0
            ? 'Sem Estoque'
            : selectedInventoryProduct.stockQty <= selectedInventoryProduct.minStock
              ? 'Crítico'
              : 'Em Estoque'}
        </span>
        <p className="flex flex-wrap items-center justify-end gap-1.5">
          <span className="text-[var(--text-secondary)]">Preço Base:</span>
          <span className="font-semibold text-[var(--text-primary)]">{selectedPriceLine.basePrice}</span>
          <span className="text-[var(--text-muted)]">›</span>
          <span className="text-[var(--text-secondary)]">Preço Venda:</span>
          <span className="font-semibold text-[var(--text-primary)]">{selectedPriceLine.salePrice}</span>
          <span className="text-[var(--text-muted)]">›</span>
          <span className="text-[var(--text-secondary)]">Valor Total:</span>
          <span className="font-semibold text-[var(--text-primary)]">{selectedPriceLine.totalValue}</span>
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <PackagePlus className="h-4 w-4 text-[#22c55e]" />
            Entradas
          </p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-2xl">{selectedMovementStats.inbound}</p>
            <MiniGauge value={selectedMovementStats.inbound} max={selectedGaugeMax.inMax} color="#22c55e" />
          </div>
          <p className="text-xs text-[var(--text-muted)]">últimos 30d</p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <PackageMinus className="h-4 w-4 text-[#ef4444]" />
            Saídas
          </p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-2xl">{selectedMovementStats.outbound}</p>
            <MiniGauge value={selectedMovementStats.outbound} max={selectedGaugeMax.outMax} color="#ef4444" />
          </div>
          <p className="text-xs text-[var(--text-muted)]">últimos 30d</p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <Package className="h-4 w-4 text-[#3b82f6]" />
            Qtd Disponível
          </p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-2xl">
              {Math.max(
                0,
                selectedInventoryProduct.stockQty -
                  (selectedInventoryProduct.reservedQty ?? 0),
              )}
            </p>
            <MiniGauge
              value={Math.max(
                0,
                selectedInventoryProduct.stockQty -
                  (selectedInventoryProduct.reservedQty ?? 0),
              )}
              max={selectedGaugeMax.availableMax}
              color="#3b82f6"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {(selectedInventoryProduct.reservedQty ?? 0) > 0
              ? `${selectedInventoryProduct.reservedQty} reservada(s) · ${selectedInventoryProduct.stockQty} em estoque`
              : 'disponível'}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
          <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
            Estoque mín.
          </p>
          <div className="mt-3 flex items-end justify-between gap-2">
            <p className="text-lg font-bold text-[var(--text-primary)] sm:text-2xl">{selectedInventoryProduct.minStock}</p>
            <MiniGauge value={selectedInventoryProduct.minStock} max={selectedGaugeMax.minMax} color="#f59e0b" />
          </div>
          <p className="text-xs text-[var(--text-muted)]">configurado</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Tabela de Movimentações Recentes</p>
        <div className="erp-scrollbar overflow-x-auto rounded-xl border border-[var(--border-color)]">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-2 py-1">Data/Hora</th>
                <th className="px-2 py-1">Tipo de Movimento</th>
                <th className="px-2 py-1">Quantidade</th>
                <th className="px-2 py-1">Referência</th>
                <th className="px-2 py-1">Responsável</th>
                {isAdmin ||
                selectedMovements.some((m) => m.movementType === 'RESERVE') ? (
                  <th className="px-2 py-1 text-right">Ações</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {selectedMovements.map((m, idx) => (
                <tr
                  key={m.id}
                  className={`border-b border-[var(--border-color)] ${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--input-bg)]'}`}
                >
                  <td className="px-2 py-1 text-[var(--text-primary)]">{formatDateTime(m.movementDate)}</td>
                  <td className="px-2 py-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      m.movementType === 'INBOUND' ? 'bg-emerald-100 text-emerald-800' :
                      m.movementType === 'OUTBOUND' ? 'bg-rose-100 text-rose-800' :
                      isAjusteMovementType(m.movementType) ? 'bg-amber-100 text-amber-800' :
                      'bg-violet-100 text-violet-800'
                    }`}>
                      {MOVEMENT_LABEL[m.movementType] ?? m.movementType}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[var(--text-primary)]">{m.quantity}</td>
                  <td className="px-2 py-1 text-[var(--text-primary)]">{formatMovementReference(m)}</td>
                  <td className="px-2 py-1 text-[var(--text-primary)]">
                    {m.movedBy?.name ?? currentUserName ?? '—'}
                  </td>
                  {isAdmin || m.movementType === 'RESERVE' ? (
                    <td className="px-2 py-1 text-right">
                      {renderMovementRowActions(m)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
        <button
          type="button"
          onClick={() => void openMoveModal('entrada', selectedInventoryProduct)}
          className="inline-flex h-[44px] min-w-[140px] flex-1 items-center justify-center rounded-xl bg-[var(--success)] px-4 text-sm font-semibold text-[var(--color-text-inverse)]"
        >
          → Entrada de Estoque
        </button>
        <button
          type="button"
          onClick={() => void openMoveModal('ajuste', selectedInventoryProduct)}
          className="inline-flex h-[44px] min-w-[140px] flex-1 items-center justify-center rounded-xl bg-[var(--warning)] px-4 text-sm font-semibold text-[var(--color-text-inverse)]"
        >
          ⇄ Ajuste de Estoque
        </button>
        <button
          type="button"
          onClick={() => void openReserveModal()}
          className="inline-flex h-[44px] min-w-[120px] flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-[var(--color-text-inverse)]"
        >
          <Bookmark className="h-4 w-4" />
          Reservar
        </button>
        <button
          type="button"
          onClick={() => setTab('movements')}
          className="inline-flex h-[44px] min-w-[140px] flex-1 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--color-text-inverse)]"
        >
          📋 Histórico Completo
        </button>
      </div>
    </>
  ) : null;

  return (
    <div
      className={`scroll-mt-8 pt-2 sm:pt-6 ${
        tab === 'inventory' || tab === 'movements'
          ? 'flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-3 overflow-hidden'
          : 'space-y-9 sm:space-y-10'
      }`}
    >

      {bannerError ? (
        <GlassCard className="shrink-0 border border-rose-500/30 bg-rose-100 px-4 py-3 text-sm text-rose-800">
          {bannerError}
        </GlassCard>
      ) : null}

      {bannerSuccess && !bannerError ? (
        <GlassCard className="shrink-0 border border-emerald-500/35 bg-emerald-100 px-4 py-3 text-sm text-emerald-800">
          {bannerSuccess}
        </GlassCard>
      ) : null}

      <GlassCard glow="none" className="flex shrink-0 flex-wrap gap-2 border-gray-200 p-3">
        {tabButton(
          'dashboard',
          'Dashboard',
          <BarChart3 className="h-4 w-4 text-violet-600" />,
        )}
        {tabButton(
          'inventory',
          'Inventário',
          <ClipboardList className="h-4 w-4 text-emerald-700" />,
        )}
        {tabButton(
          'movements',
          'Movimentações',
          <ArrowRightLeft className="h-4 w-4 text-violet-600" />,
        )}
      </GlassCard>

      {tab === 'dashboard' ? (
        <div className="flex max-h-[calc(100dvh-10.5rem)] flex-col gap-3 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Visão geral do estoque {dashboardPeriodSuffix}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { value: 'today' as const, label: 'Hoje' },
                    { value: 'week' as const, label: 'Esta semana' },
                    { value: 'month' as const, label: 'Este mês' },
                    { value: 'quarter' as const, label: '3 meses' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={dashboardCustomDateActive}
                    onClick={() => setDashboardPeriod(option.value)}
                    className={dashboardPeriodButtonClass(
                      dashboardPeriod === option.value,
                      dashboardCustomDateActive,
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px]">
                  <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    De:
                  </label>
                  <input
                    type="date"
                    value={dashboardDateFrom}
                    onChange={(e) => setDashboardDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
                <div className="min-w-[140px]">
                  <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    Até:
                  </label>
                  <input
                    type="date"
                    value={dashboardDateTo}
                    onChange={(e) => setDashboardDateTo(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>
              <GlowButton
                variant="secondary"
                className="px-4 py-2 text-sm"
                onClick={clearDashboardFilters}
              >
                Limpar filtros
              </GlowButton>
            </div>
          </div>

          {summaryLoading && !summary ? (
            <MetricCardsSkeleton count={6} className="shrink-0 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6" />
          ) : null}

          <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">SKUs Ativos</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-2xl">{summary?.activeProducts ?? 0}</p>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">Total em Estoque</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-2xl">{summary?.totalUnitsOnHand ?? 0}</p>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">Crítico</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-2xl">{summary?.skusBelowMinStock ?? 0}</p>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">
                {dashboardPeriod === 'today' ? 'Entradas hoje' : 'Entradas no período'}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-2xl">{entriesInPeriod}</p>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">Valor em Estoque</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-xl">
                {formatBrl(String(summary?.valorEstoque ?? 0))}
              </p>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 shadow-sm md:p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-[10px] font-semibold text-[var(--text-secondary)] md:text-xs">Valor a Venda</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-[var(--text-primary)] md:mt-1 md:text-xl">
                {formatBrl(String(summary?.valorVenda ?? 0))}
              </p>
            </GlassCard>
          </div>

          <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 xl:grid-cols-12">
            <GlassCard className="flex h-[220px] flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3 xl:col-span-7">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Entradas vs Saídas {dashboardPeriodSuffix}
              </h3>
              <div className={`${DASHBOARD_LIST_SCROLL} flex-1`}>
                {dashboardBars.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Sem movimentações de entrada ou saída no período.
                  </p>
                ) : (
                  dashboardBars.map((d) => (
                    <div key={d.date} className="grid grid-cols-[52px_1fr] items-center gap-3">
                      <p className="text-xs text-[var(--text-secondary)]">{d.date}</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-14 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Entrada</span>
                          <div className="h-2 flex-1 rounded bg-[var(--input-bg)]">
                            <div
                              className="h-2 rounded bg-[#22c55e]"
                              style={{ width: `${(d.in / dashboardBarMax) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-xs text-[var(--text-primary)]">{d.in}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-14 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Saída</span>
                          <div className="h-2 flex-1 rounded bg-[var(--input-bg)]">
                            <div
                              className="h-2 rounded bg-[#ef4444]"
                              style={{ width: `${(d.out / dashboardBarMax) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-xs text-[var(--text-primary)]">{d.out}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
            <GlassCard className="flex h-[220px] flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3 xl:col-span-5">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Evolução do estoque {dashboardPeriodSuffix}
              </h3>
              <div className="mt-2 min-h-0 flex-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2">
                <svg
                  viewBox={`0 0 ${stockTrendChart.width} ${stockTrendChart.height}`}
                  className="h-full w-full"
                  role="img"
                  aria-label={`Evolução do estoque ${dashboardPeriodSuffix}`}
                >
                  <line
                    x1={stockTrendChart.pad}
                    y1={stockTrendChart.height - stockTrendChart.pad}
                    x2={stockTrendChart.width - stockTrendChart.pad}
                    y2={stockTrendChart.height - stockTrendChart.pad}
                    stroke="var(--border-color)"
                  />
                  <line
                    x1={stockTrendChart.pad}
                    y1={stockTrendChart.pad}
                    x2={stockTrendChart.pad}
                    y2={stockTrendChart.height - stockTrendChart.pad}
                    stroke="var(--border-color)"
                  />
                  <polygon points={stockTrendChart.area} fill="rgba(91,94,244,0.2)" />
                  <polyline
                    points={stockTrendChart.points}
                    fill="none"
                    stroke="#5b5ef4"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </GlassCard>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
            <GlassCard className="flex min-h-0 flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Top 10 Mais Movimentados {dashboardPeriodSuffix}
              </h3>
              <div className={DASHBOARD_LIST_SCROLL}>
                {dashboardTopMoved.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Sem movimentações no período.</p>
                ) : (
                  dashboardTopMoved.map((x) => (
                    <div
                      key={x.productId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-[var(--text-primary)]">
                        {x.sku} — {x.name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                        {x.totalVolume} un.
                      </span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="flex min-h-0 flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Top 10 Maiores Entradas {dashboardPeriodSuffix}
              </h3>
              <div className={DASHBOARD_LIST_SCROLL}>
                {dashboardTopInbound.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Sem entradas no período.</p>
                ) : (
                  dashboardTopInbound.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[var(--text-secondary)]">
                          {formatDateTime(m.movementDate)}
                        </span>
                        <span className="text-sm font-semibold text-emerald-400">
                          +{m.quantity} un.
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-[var(--text-primary)]">
                        {m.productSku} — {m.productName}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {m.movedByName ?? '—'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="flex min-h-0 flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Top 10 Produtos Parados {dashboardPeriodSuffix}
              </h3>
              <div className={DASHBOARD_LIST_SCROLL}>
                {dashboardStagnant.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">
                    Todos os produtos tiveram movimentação no período.
                  </p>
                ) : (
                  dashboardStagnant.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
                    >
                      <p className="min-w-0 truncate text-sm text-[var(--text-primary)]">
                        {p.sku} — {p.name}
                      </p>
                      <span className="ml-2 shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                        {p.stockQty} un.
                      </span>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>

            <GlassCard className="flex min-h-0 flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <h3 className="shrink-0 text-sm font-semibold text-[var(--text-primary)]">
                Top 10 Estoque Crítico
              </h3>
              <div className={DASHBOARD_LIST_SCROLL}>
                {dashboardCritical.length === 0 ? (
                  <p className="text-sm font-medium text-emerald-700">
                    Nenhum SKU em estado crítico ✓
                  </p>
                ) : (
                  dashboardCritical.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openInventoryForSku(p.sku)}
                      className="flex w-full items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--input-bg)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-[var(--text-primary)]">
                          {p.sku} — {p.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Atual: {p.stockQty} | Mínimo: {p.minStock} | Déficit: {p.deficit}
                        </p>
                      </div>
                      <span className="ml-2 shrink-0 rounded-full bg-rose-100 px-2 py-1 text-[10px] font-semibold text-rose-800">
                        Crítico
                      </span>
                    </button>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {tab === 'movements' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Movimentações de estoque
            </h2>
            <GlowButton
              variant="secondary"
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs"
              disabled={movementsExporting || movementsLoading}
              onClick={() => void exportMovementsCsv()}
            >
              {movementsExporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Exportar CSV
            </GlowButton>
          </div>

          <GlassCard className="relative z-20 shrink-0 border-[var(--border-color)] bg-[var(--bg-card)] p-2.5">
            <ErpFilterBar<MovementFilterPreset>
              storageKey={MOVEMENTS_FILTER_KEY}
              badges={movementFilterBadges}
              hasActiveFilters={hasMovementFilters}
              onRemoveBadge={removeMovementFilterBadge}
              onClearAll={clearMovementFilters}
              presetValue={movementFilterPreset}
              onApplyPreset={(preset) => {
                setMoveFilterSearch(preset.search);
                setMoveTypeCardFilters(new Set(preset.types));
                setMoveFilterUserId(preset.userId);
                setMoveFilterPeriod(preset.period);
                setMoveFilterDateFrom(preset.dateFrom);
                setMoveFilterDateTo(preset.dateTo);
              }}
              searchSlot={
                <div className="relative erp-filter-search-slot">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={moveFilterSearch}
                    onChange={(e) => setMoveFilterSearch(e.target.value)}
                    placeholder="Buscar produto..."
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-1.5 pl-9 pr-3 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
              }
            >
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(MOVE_TYPE_LABEL) as MoveTypeCardFilter[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleMoveTypeCardFilter(type)}
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                      moveTypeCardFilters.has(type)
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {MOVE_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    Responsável
                  </label>
                  <PremiumSelect
                    value={moveFilterUserId || '__all__'}
                    onChange={(v) => setMoveFilterUserId(v === '__all__' ? '' : v)}
                    options={[
                      { value: '__all__', label: 'Todos' },
                      ...movementUsers.map((u) => ({
                        value: u.id,
                        label: u.name,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    Período
                  </label>
                  <PremiumSelect
                    value={moveFilterPeriod}
                    onChange={(v) => setMoveFilterPeriod(v as MovePeriodPreset)}
                    options={[
                      { value: 'today', label: 'Hoje' },
                      { value: 'week', label: 'Esta semana' },
                      { value: 'month', label: 'Este mês' },
                      { value: 'custom', label: 'Intervalo personalizado' },
                    ]}
                  />
                </div>
              </div>
              {moveFilterPeriod === 'custom' ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                      De
                    </label>
                    <input
                      type="date"
                      value={moveFilterDateFrom}
                      onChange={(e) => setMoveFilterDateFrom(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                      Até
                    </label>
                    <input
                      type="date"
                      value={moveFilterDateTo}
                      onChange={(e) => setMoveFilterDateTo(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                    />
                  </div>
                </div>
              ) : null}
            </ErpFilterBar>
          </GlassCard>

          <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => toggleMoveTypeCardFilter('entrada')}
              className={`text-left rounded-2xl transition focus-visible:outline-none ${
                moveTypeCardFilters.has('entrada')
                  ? 'ring-2 ring-emerald-500/60 border-2 border-emerald-500/40'
                  : 'hover:ring-1 hover:ring-emerald-500/30'
              }`}
            >
              <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  Total entradas
                </p>
                <p className="mt-0.5 text-xl font-bold text-emerald-600">
                  {movementsSummary?.totalInbound ?? 0}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">no período</p>
                <PackagePlus className="mt-1.5 h-4 w-4 text-emerald-500" />
              </GlassCard>
            </button>
            <button
              type="button"
              onClick={() => toggleMoveTypeCardFilter('saida')}
              className={`text-left rounded-2xl transition focus-visible:outline-none ${
                moveTypeCardFilters.has('saida')
                  ? 'ring-2 ring-rose-500/60 border-2 border-rose-500/40'
                  : 'hover:ring-1 hover:ring-rose-500/30'
              }`}
            >
              <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  Total saídas
                </p>
                <p className="mt-0.5 text-xl font-bold text-rose-600">
                  {movementsSummary?.totalOutbound ?? 0}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">no período</p>
                <PackageMinus className="mt-1.5 h-4 w-4 text-rose-500" />
              </GlassCard>
            </button>
            <button
              type="button"
              onClick={() => toggleMoveTypeCardFilter('reserva')}
              className={`text-left rounded-2xl transition focus-visible:outline-none ${
                moveTypeCardFilters.has('reserva')
                  ? 'ring-2 ring-violet-500/60 border-2 border-violet-500/40'
                  : 'hover:ring-1 hover:ring-violet-500/30'
              }`}
            >
              <GlassCard
                className="border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-sm"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  Reservados
                </p>
                <p className="mt-0.5 text-xl font-bold text-violet-600">
                  {movementsSummary?.totalReserved ?? 0}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  unidades (RESERVE / RESERVA) no período
                </p>
                <Bookmark className="mt-1.5 h-4 w-4 text-violet-500" />
              </GlassCard>
            </button>
            <button
              type="button"
              onClick={() => toggleMoveTypeCardFilter('ajuste')}
              className={`text-left rounded-2xl transition focus-visible:outline-none ${
                moveTypeCardFilters.has('ajuste')
                  ? 'ring-2 ring-amber-500/60 border-2 border-amber-500/40'
                  : 'hover:ring-1 hover:ring-amber-500/30'
              }`}
            >
              <GlassCard
                className="border-[var(--border-color)] bg-[var(--bg-card)] p-2 shadow-sm"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  Ajustes
                </p>
                <p className="mt-0.5 text-xl font-bold text-amber-600">
                  {movementsSummary?.totalAdjustments ?? 0}
                </p>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  movimentações de ajuste no período
                </p>
                <SlidersHorizontal className="mt-1.5 h-4 w-4 text-amber-500" />
              </GlassCard>
            </button>
          </div>

          {movementsLoading ? (
            <GlassCard className="shrink-0 p-4">
              <ListSkeleton rows={6} />
            </GlassCard>
          ) : movementsData && movementsData.data.length === 0 ? (
            <EmptyState
              icon={ArrowRightLeft}
              title="Sem movimentações"
              description="O histórico será preenchido conforme entradas, ajustes e reservas forem registrados no Inventário."
            />
          ) : (
            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              <DataTablePremium
                title="Histórico de movimentações"
                subtitle={`${movementsData?.meta.total ?? 0} registro(s) · clique na linha para detalhes`}
                columns={movementTableColumns}
                rows={movementRows}
                showStatusColumn={false}
                dense
                bodyClassName="max-h-full"
                headerActions={
                  <TableColumnsPicker
                    definitions={movementColumnPrefs.definitions}
                    preferences={movementColumnPrefs.preferences}
                    onToggle={movementColumnPrefs.setVisible}
                    onReorder={movementColumnPrefs.reorder}
                    onReset={movementColumnPrefs.reset}
                    ariaLabel="Configurar colunas da tabela de movimentações"
                  />
                }
                onRowClick={(row) => setMovementDetailId(row.id)}
                actionsColumn={
                  isAdmin ||
                  (movementsData?.data.some((m) => m.movementType === 'RESERVE') ??
                    false)
                    ? {
                        header: 'Ações',
                        columnClassName: 'w-24 min-w-[6rem]',
                        render: (row) => {
                          const item = movementsData?.data.find(
                            (m) => m.id === row.id,
                          );
                          return item ? renderMovementRowActions(item) : null;
                        },
                      }
                    : undefined
                }
              />
            </div>
          )}
        </div>
      ) : null}

      {tab === 'inventory' ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[38fr_62fr]">
          <GlassCard className="flex h-full min-h-0 flex-col overflow-hidden border-[var(--border-color)] bg-[var(--bg-card)] p-3 sm:p-4">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] sm:text-xl">
                Visão Geral do Estoque - Lista de SKUs
              </h3>
              <GlowButton variant="primary" onClick={openCreateProduct}>
                <Plus className="h-4 w-4" />
                Cadastrar item
              </GlowButton>
            </div>
            <div className="shrink-0">
            <ErpFilterBar<InventoryFilterPreset>
              storageKey={INVENTORY_FILTER_KEY}
              badges={inventoryFilterBadges}
              hasActiveFilters={hasInventoryFilters}
              onRemoveBadge={removeInventoryFilterBadge}
              onClearAll={clearInventoryFilters}
              presetValue={inventoryFilterPreset}
              onApplyPreset={(preset) => {
                setInventoryFilter(preset.inventoryFilter);
                setShowInactive(preset.showInactive);
                setInventorySupplierFilterId(preset.supplierId);
                setInventoryCategoryFilterId(preset.categoryId);
                setProductSearch(preset.search);
                setProductPage(1);
              }}
              searchSlot={
                <div className="relative erp-filter-search-slot">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Buscar SKU ou nome do produto..."
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  />
                </div>
              }
            >
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSupplierFilterSearch('');
                    setSupplierFilterModalOpen(true);
                  }}
                  className={inventoryFilterPickerButtonClass(
                    Boolean(inventorySupplierFilterId),
                  )}
                >
                  <span>Fornecedor</span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-medium text-[var(--text-muted)]">
                    {selectedInventorySupplierName ?? 'Todos'}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilterSearch('');
                    setCategoryFilterModalOpen(true);
                  }}
                  className={inventoryFilterPickerButtonClass(
                    Boolean(inventoryCategoryFilterId),
                  )}
                >
                  <span>Categoria</span>
                  <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-medium text-[var(--text-muted)]">
                    {selectedInventoryCategory ? (
                      <>
                        {selectedInventoryCategory.color ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/25"
                            style={{
                              backgroundColor: selectedInventoryCategory.color,
                            }}
                            aria-hidden
                          />
                        ) : null}
                        <span className="truncate">
                          {selectedInventoryCategory.name}
                        </span>
                      </>
                    ) : (
                      'Todas'
                    )}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInventoryFilter((cur) => (cur === 'out' ? 'all' : 'out'));
                    setProductPage(1);
                  }}
                  className={inventoryFilterButtonClass(inventoryFilter === 'out')}
                >
                  <span>Sem estoque</span>
                  {inventoryFilter === 'out' ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      ativo
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInventoryFilter((cur) => (cur === 'low' ? 'all' : 'low'));
                    setProductPage(1);
                  }}
                  className={inventoryFilterButtonClass(inventoryFilter === 'low')}
                >
                  <span>Crítico</span>
                  {inventoryFilter === 'low' ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      ativo
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInventoryFilter((cur) =>
                      cur === 'reserva' ? 'all' : 'reserva',
                    );
                    setProductPage(1);
                  }}
                  className={inventoryFilterButtonClass(inventoryFilter === 'reserva')}
                >
                  <span>Reserva</span>
                  {inventoryFilter === 'reserva' ? (
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      ativo
                    </span>
                  ) : null}
                </button>
                {isAdmin ? (
                  <label className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-xl border border-[var(--border-color)] px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={showInactive}
                      onChange={(e) => {
                        setShowInactive(e.target.checked);
                        setProductPage(1);
                      }}
                      className="h-3.5 w-3.5 accent-[var(--accent)]"
                    />
                    Mostrar inativos
                  </label>
                ) : null}
              </div>
            </ErpFilterBar>
            </div>
            {productsLoading ? (
              <div className="lista-container mt-3">
                <CardGridSkeleton count={6} className="md:grid-cols-2" />
              </div>
            ) : (
              <div
                ref={inventoryListScrollRef}
                onScroll={syncInventoryListScroll}
                className="lista-container erp-scrollbar mt-3 overflow-x-auto pr-1"
              >
                {inventoryProducts.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Package}
                    title="Nenhum produto encontrado"
                    description="Cadastre produtos ou ajuste os filtros para ver itens no inventário."
                    actionLabel="Novo produto"
                    onAction={openCreateProduct}
                  />
                ) : (
                <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
              {inventoryProducts.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectInventoryProduct(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectInventoryProduct(p.id);
                    }
                  }}
                  className={`relative cursor-pointer rounded-xl border p-3 text-left transition ${selectedInventoryId === p.id ? 'border-2 border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--input-bg)]'}`}
                >
                  <div className={p.isActive ? '' : 'opacity-50'}>
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs ${selectedInventoryId === p.id ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>#{p.sku}</p>
                      <div className="flex items-center gap-1">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--input-bg)] text-[var(--text-secondary)]">
                          <Package className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          aria-label={`Configurações de ${p.name}`}
                          disabled={togglingProductId === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setProductMenuOpenId((cur) => (cur === p.id ? null : p.id));
                          }}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--input-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                        >
                          {togglingProductId === p.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Settings className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 truncate text-sm font-medium text-[var(--text-primary)]">{p.name}</p>
                      {!p.isActive ? (
                        <span className="shrink-0 rounded-full border border-rose-300 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500">
                          Inativo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-lg font-bold text-[var(--text-primary)] sm:text-xl">{p.stockQty}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className={`rounded-full border px-2 py-0.5 ${
                        p.stockQty <= 0
                          ? 'border-rose-300 bg-rose-500/10 text-rose-500'
                          : p.stockQty <= p.minStock
                            ? 'border-amber-300 bg-amber-500/10 text-amber-600'
                            : 'border-[#86efac] bg-[#dcfce7] text-[#16a34a]'
                      }`}>
                        {p.stockQty <= 0 ? 'Sem Estoque' : p.stockQty <= p.minStock ? 'Baixo Estoque' : 'Em Estoque'}
                      </span>
                      <span className="text-[var(--text-secondary)]">Corredor A-23</span>
                    </div>
                  </div>
                  {productMenuOpenId === p.id ? (
                    <div
                      className="absolute right-2 top-10 z-20 min-w-[170px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-1 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setProductMenuOpenId(null);
                          openEditProduct(p);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-[var(--input-bg)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Editar item
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleProductActive(p)}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-[var(--input-bg)] ${p.isActive ? 'text-amber-400' : 'text-emerald-400'}`}
                      >
                        {p.isActive ? (
                          <>
                            <Ban className="h-3.5 w-3.5" />
                            Desativar produto
                          </>
                        ) : (
                          <>
                            <Undo2 className="h-3.5 w-3.5" />
                            Reativar produto
                          </>
                        )}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setProductMenuOpenId(null);
                            inactivateProduct(p);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-400 transition hover:bg-[var(--input-bg)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir produto
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
                </div>
                )}
              </div>
            )}
            <p className="mt-2 shrink-0 text-xs text-[var(--text-muted)]">
              {inventoryProducts.length} produto(s) · Operador 1 | Filial Londrina
            </p>
          </GlassCard>

          <GlassCard className="lista-container hidden h-full p-3 sm:p-4 lg:block">
            {selectedInventoryProduct ? (
              inventoryDetailPanelContent
            ) : (
              <EmptyState title="Selecione um SKU" description="Escolha um item na lista para ver os detalhes." />
            )}
          </GlassCard>

          {selectedInventoryProduct ? (
            <div
              className="fixed inset-0 z-[65] flex flex-col bg-[var(--bg-primary)] lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Detalhes do produto"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))]">
                <p className="min-w-0 truncate text-sm font-semibold text-[var(--text-primary)]">
                  #{selectedInventoryProduct.sku} — {selectedInventoryProduct.name}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedInventoryId(null);
                  }}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  aria-label="Fechar detalhes do produto"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {inventoryDetailPanelContent}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {productModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setProductModalOpen(false)}
        >
          <div className="h-[100dvh] w-screen max-w-none sm:h-auto sm:w-full sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
            <GlassCard className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none p-3 shadow-2xl sm:max-h-[90vh] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                {productModalMode === 'create' ? 'Novo produto' : 'Editar produto'}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Fechar
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              SKU é o identificador principal. Campos com * são obrigatórios.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-gray-500 sm:col-span-2">
                Nome *
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-gray-500 sm:col-span-1">
                SKU *
                <input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-gray-500 sm:col-span-1">
                SKU do fornecedor
                <input
                  value={form.supplierSku}
                  onChange={(e) => setForm((f) => ({ ...f, supplierSku: e.target.value }))}
                  placeholder="Código no catálogo do fornecedor"
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-gray-500 sm:col-span-2">
                Fornecedor
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                >
                  <option value="">Selecione...</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <CategorySelect
                  categories={productCategories}
                  value={form.categoryId}
                  onChange={(categoryId) =>
                    setForm((f) => ({ ...f, categoryId }))
                  }
                  onRefreshCategories={loadCategories}
                  onError={(msg) => setBannerError(msg)}
                  disabled={formSaving}
                />
              </div>
              <label className="block text-xs text-gray-500 sm:col-span-1">
                Preço (R$) *
                <input
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-gray-500 sm:col-span-1">
                Custo (R$)
                <input
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-gray-500 sm:col-span-2">
                Estoque mínimo *
                <input
                  value={form.minStock}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, minStock: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <GlowButton
                variant="secondary"
                onClick={() => setProductModalOpen(false)}
              >
                Cancelar
              </GlowButton>
              <GlowButton
                variant="primary"
                disabled={formSaving}
                onClick={() => void saveProduct()}
              >
                {formSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando
                  </>
                ) : (
                  'Salvar'
                )}
              </GlowButton>
            </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {moveModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setMoveModalOpen(false)}
        >
          <div className="h-[100dvh] w-screen max-w-none sm:h-auto sm:w-full sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
            <GlassCard className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none border-gray-200 p-3 shadow-[0_0_48px_-12px_rgba(56,189,248,0.25)] sm:max-h-[92vh] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {MOVE_MODAL_TITLE[moveForm.movementKind]}
                  </h2>
                  <span className="rounded-full border border-violet-400/25 bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-800">
                    {MOVEMENT_KIND_CHIP[moveForm.movementKind]}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  Integra cards de estoque e catálogo logo após registrar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoveModalOpen(false)}
                className="shrink-0 rounded-lg px-2 py-1 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
              >
                Fechar
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {movePresetProduct ? (
                <div className="space-y-3 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {movePresetProduct.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      SKU {movePresetProduct.sku}
                    </p>
                  </div>
                  {moveForm.movementKind === 'ajuste' ? (
                    <>
                      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Preço Base
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={moveForm.cost}
                          onChange={(e) =>
                            setMoveForm((f) => ({ ...f, cost: e.target.value }))
                          }
                          placeholder="0,00"
                          className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent placeholder:text-[var(--text-muted)] focus:border-sky-400/40 focus:ring-sky-400/20"
                        />
                      </label>
                      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                        Preço Venda
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          value={moveForm.price}
                          onChange={(e) =>
                            setMoveForm((f) => ({ ...f, price: e.target.value }))
                          }
                          placeholder="0,00"
                          className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent placeholder:text-[var(--text-muted)] focus:border-sky-400/40 focus:ring-sky-400/20"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              ) : (
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Produto *
                  <div className="mt-1.5">
                    <PremiumSelect
                      value={moveForm.productId}
                      onChange={(productId) => {
                        const picked = productPicker.find((p) => p.id === productId);
                        setMoveForm((f) => ({
                          ...f,
                          productId,
                          quantity: picked != null ? String(picked.stockQty) : f.quantity,
                        }));
                      }}
                      options={productSelectOptions}
                      placeholder="Selecione um produto…"
                      placement="above"
                    />
                  </div>
                </label>
              )}
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Quantidade *
                <input
                  value={moveForm.quantity}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  placeholder={
                    moveForm.movementKind === 'ajuste'
                      ? movePresetProduct
                        ? 'Saldo desejado'
                        : 'Ex.: +10 ou -5'
                      : 'Inteiro positivo'
                  }
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent placeholder:text-[var(--text-muted)] focus:border-sky-400/40 focus:ring-sky-400/20"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                Observação / motivo
                {moveForm.movementKind === 'ajuste' ? ' *' : ' (opcional)'}
                <textarea
                  value={moveForm.notes}
                  onChange={(e) => {
                    setMoveNotesError(null);
                    setMoveForm((f) => ({ ...f, notes: e.target.value }));
                  }}
                  rows={3}
                  required={moveForm.movementKind === 'ajuste'}
                  className={`mt-1.5 w-full resize-none rounded-xl border bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent focus:border-gray-200 ${
                    moveNotesError
                      ? 'border-rose-400/50 focus:border-rose-400/50'
                      : 'border-[var(--border-color)]'
                  }`}
                />
                {moveNotesError ? (
                  <p className="mt-1.5 text-xs text-rose-500">{moveNotesError}</p>
                ) : null}
              </label>
              {moveForm.movementKind === 'ajuste' ? (
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                  Ajustes de estoque requerem autorização e são registrados com nome,
                  hora e data do responsável.
                </p>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <GlowButton
                variant="secondary"
                onClick={() => setMoveModalOpen(false)}
              >
                Cancelar
              </GlowButton>
              <GlowButton
                variant="primary"
                disabled={moveSaving || !moveForm.productId}
                onClick={requestSaveMovement}
              >
                {moveSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando
                  </>
                ) : (
                  'Registrar'
                )}
              </GlowButton>
            </div>
          </GlassCard>
          </div>
        </div>
      ) : null}

      {movementDeleteStep === 'confirm' && movementDeleteTarget ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={cancelMovementDelete}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Excluir movimentação
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {buildMovementDeleteRevertMessage(movementDeleteTarget)}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <GlowButton
                  variant="secondary"
                  disabled={movementDeleting}
                  onClick={cancelMovementDelete}
                >
                  Cancelar
                </GlowButton>
                <GlowButton
                  variant="primary"
                  disabled={movementDeleting}
                  onClick={() => void executeMovementDelete()}
                >
                  {movementDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Excluindo
                    </>
                  ) : (
                    'Confirmar exclusão'
                  )}
                </GlowButton>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {productDeleteTarget ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={cancelProductDelete}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Excluir produto
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Você está excluindo o produto{' '}
                <span className="font-semibold text-[var(--text-primary)]">
                  {productDeleteTarget.name}
                </span>{' '}
                (SKU {productDeleteTarget.sku}). Esta ação não pode ser desfeita.
                Confirmar?
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <GlowButton
                  variant="secondary"
                  disabled={productDeleting}
                  onClick={cancelProductDelete}
                >
                  Cancelar
                </GlowButton>
                <GlowButton
                  variant="primary"
                  disabled={productDeleting}
                  onClick={() => void executeProductDelete()}
                >
                  {productDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Excluindo
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </GlowButton>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {reserveOpen && selectedInventoryProduct ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={closeReserveModal}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-6">
              {reserveStep === 'form' ? (
                <>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Reservar estoque
                  </h2>
                  <div className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5">
                    <p className="text-xs text-[var(--text-secondary)]">Produto</p>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {selectedInventoryProduct.name}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      SKU {selectedInventoryProduct.sku}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Recebedor *
                      <div className="mt-1.5">
                        <PremiumSelect
                          value={reserveForm.receiverId}
                          onChange={(receiverId) =>
                            setReserveForm((f) => ({ ...f, receiverId }))
                          }
                          options={reserveReceivers.map((r) => ({
                            value: r.id,
                            label: r.name,
                          }))}
                          placeholder="Selecione o recebedor…"
                        />
                      </div>
                    </label>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Quantidade *
                      <input
                        type="number"
                        min={1}
                        value={reserveForm.quantity}
                        onChange={(e) =>
                          setReserveForm((f) => ({
                            ...f,
                            quantity: e.target.value,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none"
                      />
                    </label>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                      Observação (opcional)
                      <textarea
                        value={reserveForm.notes}
                        onChange={(e) =>
                          setReserveForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        rows={2}
                        className="mt-1.5 w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none"
                      />
                    </label>
                  </div>
                  {reserveError ? (
                    <p className="mt-3 text-sm text-rose-500">{reserveError}</p>
                  ) : null}
                  <div className="mt-6 flex justify-end gap-2">
                    <GlowButton variant="secondary" onClick={closeReserveModal}>
                      Cancelar
                    </GlowButton>
                    <GlowButton variant="primary" onClick={requestReserveConfirm}>
                      Continuar
                    </GlowButton>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Confirmar reserva
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                    Você está reservando{' '}
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reserveForm.quantity.trim()}
                    </span>{' '}
                    unidade(s) de{' '}
                    <span className="font-semibold text-[var(--text-primary)]">
                      {selectedInventoryProduct.name}
                    </span>{' '}
                    para{' '}
                    <span className="font-semibold text-[var(--text-primary)]">
                      {reserveReceivers.find((r) => r.id === reserveForm.receiverId)
                        ?.name ?? '—'}
                    </span>
                    . Confirmar?
                  </p>
                  {reserveError ? (
                    <p className="mt-3 text-sm text-rose-500">{reserveError}</p>
                  ) : null}
                  <div className="mt-6 flex justify-end gap-2">
                    <GlowButton
                      variant="secondary"
                      disabled={reserveSaving}
                      onClick={() => setReserveStep('form')}
                    >
                      Voltar
                    </GlowButton>
                    <GlowButton
                      variant="primary"
                      disabled={reserveSaving}
                      onClick={() => void executeReserveSave()}
                    >
                      {reserveSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Salvando
                        </>
                      ) : (
                        'Confirmar'
                      )}
                    </GlowButton>
                  </div>
                </>
              )}
            </GlassCard>
          </div>
        </div>
      ) : null}

      {moveConfirmOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => {
            setMoveConfirmOpen(false);
            setPendingPresetAjustePlan(null);
            setMoveConfirmMessages([]);
          }}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Confirmar ajuste
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Revise as alterações antes de registrar:
              </p>
              <ul className="mt-4 space-y-2">
                {moveConfirmMessages.map((msg) => (
                  <li
                    key={msg}
                    className="rounded-lg border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {msg}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex justify-end gap-2">
                <GlowButton
                  variant="secondary"
                  disabled={moveSaving}
                  onClick={() => {
                    setMoveConfirmOpen(false);
                    setPendingPresetAjustePlan(null);
                    setMoveConfirmMessages([]);
                  }}
                >
                  Voltar
                </GlowButton>
                <GlowButton
                  variant="primary"
                  disabled={moveSaving}
                  onClick={() => void confirmPresetAjusteSave()}
                >
                  {moveSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando
                    </>
                  ) : (
                    'Confirmar'
                  )}
                </GlowButton>
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {supplierFilterModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setSupplierFilterModalOpen(false)}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Filtrar por fornecedor
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
                  aria-label="Fechar"
                  onClick={() => setSupplierFilterModalOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={supplierFilterSearch}
                  onChange={(e) => setSupplierFilterSearch(e.target.value)}
                  placeholder="Buscar fornecedor..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setInventorySupplierFilterId('');
                    setProductPage(1);
                    setSupplierFilterModalOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    !inventorySupplierFilterId
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                  }`}
                >
                  Todos os fornecedores
                </button>
                {filteredSupplierOptions.map((supplier) => {
                  const active = inventorySupplierFilterId === supplier.id;
                  return (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => {
                        setInventorySupplierFilterId(supplier.id);
                        setProductPage(1);
                        setSupplierFilterModalOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                      }`}
                    >
                      <span className="truncate font-medium">{supplier.name}</span>
                      {active ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                          ativo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredSupplierOptions.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
                    Nenhum fornecedor encontrado.
                  </p>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {categoryFilterModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setCategoryFilterModalOpen(false)}
        >
          <div
            className="h-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="border-gray-200 p-3 shadow-2xl sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  Filtrar por categoria
                </h2>
                <button
                  type="button"
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--input-bg)] hover:text-[var(--text-primary)]"
                  aria-label="Fechar"
                  onClick={() => setCategoryFilterModalOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={categoryFilterSearch}
                  onChange={(e) => setCategoryFilterSearch(e.target.value)}
                  placeholder="Buscar categoria..."
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setInventoryCategoryFilterId('');
                    setProductPage(1);
                    setCategoryFilterModalOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                    !inventoryCategoryFilterId
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                      : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                  }`}
                >
                  Todas as categorias
                </button>
                {filteredCategoryOptions.map((category) => {
                  const active = inventoryCategoryFilterId === category.id;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setInventoryCategoryFilterId(category.id);
                        setProductPage(1);
                        setCategoryFilterModalOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]'
                          : 'border-[var(--border-color)] hover:bg-[var(--input-bg)]'
                      }`}
                      style={
                        category.color && !active
                          ? { borderColor: `${category.color}44` }
                          : undefined
                      }
                    >
                      {category.color ? (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/25"
                          style={{ backgroundColor: category.color }}
                          aria-hidden
                        />
                      ) : (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gray-500" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {category.name}
                      </span>
                      {active ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                          ativo
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {filteredCategoryOptions.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-[var(--text-muted)]">
                    Nenhuma categoria encontrada.
                  </p>
                ) : null}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      <MovementOrderDetailModal
        movementId={movementDetailId}
        onClose={() => setMovementDetailId(null)}
      />
    </div>
  );
}
