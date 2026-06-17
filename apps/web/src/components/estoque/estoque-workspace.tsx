'use client';

/* eslint-disable react-hooks/set-state-in-effect -- carregamento sob montagem, aba e debounce de busca */
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Ban,
  Bookmark,
  ClipboardList,
  Loader2,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategorySelect } from '@/src/components/estoque/category-select';
import { GlowButton } from '@/src/components/shell/glow-button';
import { GlassCard } from '@/src/components/shell/glass-card';
import {
  DataTablePremium,
  type TableColumn,
  type TableRow,
} from '@/src/components/ui/data-table-premium';
import { EmptyState } from '@/src/components/ui/empty-state';
import { PremiumSelect } from '@/src/components/ui/premium-select';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { useCloseOverlaysOnRouteChange } from '@/src/hooks/use-close-overlays-on-route';
import { erpFetchJson } from '@/src/services/api/erp-fetch';

type TabId = 'dashboard' | 'inventory' | 'movements';

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
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
};

type MovementRow = {
  id: string;
  movementType: string;
  quantity: number;
  reference: string | null;
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

const MOVEMENT_LABEL: Record<string, string> = {
  INBOUND: 'Entrada',
  OUTBOUND: 'Saída',
  ADJUSTMENT: 'Ajuste',
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
    'border border-[#86efac] bg-[#dcfce7] text-[#16a34a] hover:brightness-95 dark:border-transparent dark:bg-[#22c55e] dark:text-white',
  saida:
    'border border-[#fca5a5] bg-[#fee2e2] text-[#dc2626] hover:brightness-95 dark:border-transparent dark:bg-[#ef4444] dark:text-white',
  ajuste:
    'border border-[#fcd34d] bg-[#fef3c7] text-[#d97706] hover:brightness-95 dark:border-transparent dark:bg-[#f59e0b] dark:text-white',
  reserva:
    'border border-[#c4b5fd] bg-[#ede9fe] text-[#7c3aed] hover:brightness-95 dark:border-transparent dark:bg-[#8b5cf6] dark:text-white',
  cancelamento_reserva:
    'border border-[#cbd5e1] bg-[#f1f5f9] text-[#64748b] hover:brightness-95 dark:border-transparent dark:bg-[#1e2130] dark:text-[#8b8fa8]',
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
    return <span className="text-zinc-600">—</span>;
  }
  if ('legacy' in meta) {
    return (
      <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-zinc-500/35 bg-zinc-800/60 px-2.5 py-1 text-[11px] font-medium text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <span className="truncate">{meta.label}</span>
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
          legado
        </span>
      </span>
    );
  }
  const inactive = meta.inactiveCategory;
  const c = meta.color;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-white/[0.12] bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold tracking-tight text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
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
        <span className="shrink-0 text-[9px] font-medium text-amber-300/90">
          inativa
        </span>
      ) : null}
    </span>
  );
}

const movementColumns: TableColumn[] = [
  { key: 'date', header: 'Data' },
  { key: 'type', header: 'Tipo' },
  { key: 'product', header: 'Produto' },
  { key: 'qty', header: 'Qtd' },
  { key: 'user', header: 'Responsável' },
  { key: 'notes', header: 'Observação' },
];

type ProductFormState = {
  sku: string;
  name: string;
  categoryId: string;
  price: string;
  cost: string;
  minStock: string;
};

const emptyForm: ProductFormState = {
  sku: '',
  name: '',
  categoryId: '',
  price: '',
  cost: '',
  minStock: '0',
};

export function EstoqueWorkspace() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [summary, setSummary] = useState<StockSummary | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const [productPage, setProductPage] = useState(1);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchDebounced, setProductSearchDebounced] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [productMenuOpenId, setProductMenuOpenId] = useState<string | null>(null);
  const [togglingProductId, setTogglingProductId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'low' | 'out' | 'transit'>('all');
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsData, setProductsData] = useState<Paginated<ProductDto> | null>(
    null,
  );

  const [movePage, setMovePage] = useState(1);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsData, setMovementsData] = useState<Paginated<MovementRow> | null>(
    null,
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

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveForm, setMoveForm] = useState({
    productId: '',
    movementKind: 'entrada' as MovementKind,
    quantity: '1',
    notes: '',
    reference: '',
  });
  const [moveSaving, setMoveSaving] = useState(false);
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

  const closeAllModals = useCallback(() => {
    setProductModalOpen(false);
    setMoveModalOpen(false);
  }, []);

  useCloseOverlaysOnRouteChange(closeAllModals);

  useEffect(() => {
    if (!productModalOpen && !moveModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllModals();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [productModalOpen, moveModalOpen, closeAllModals]);

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

  const loadSummary = useCallback(async () => {
    setBannerError(null);
    try {
      const res = await erpFetchJson<StockSummary>('stock/summary', {
        method: 'GET',
      });
      setSummary(res);
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Falha ao carregar resumo.');
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === 'inventory' || tab === 'dashboard' || productModalOpen) {
      void loadCategories();
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
    async (opts: { page: number; lowStock?: boolean }) => {
      setProductsLoading(true);
      setBannerError(null);
      try {
        const params = new URLSearchParams();
        params.set('page', String(opts.page));
        params.set('pageSize', '12');
        if (productSearchDebounced.trim()) {
          params.set('search', productSearchDebounced.trim());
        }
        if (opts.lowStock) {
          params.set('lowStock', 'true');
          params.set('status', 'active');
        } else {
          // Inativos só entram na listagem para ADMIN com o toggle ligado.
          params.set('status', isAdmin && showInactive ? 'all' : 'active');
        }
        params.set('sortBy', 'name');
        params.set('sortOrder', 'asc');
        const res = await erpFetchJson<Paginated<ProductDto>>(
          `products?${params.toString()}`,
        );
        setProductsData(res);
      } catch (e) {
        setBannerError(e instanceof Error ? e.message : 'Falha ao carregar produtos.');
        setProductsData(null);
      } finally {
        setProductsLoading(false);
      }
    },
    [productSearchDebounced, isAdmin, showInactive],
  );

  useEffect(() => {
    if (tab === 'inventory' || tab === 'dashboard') {
      void loadProducts({ page: productPage, lowStock: false });
    }
  }, [tab, productPage, loadProducts]);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    setBannerError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(movePage));
      params.set('pageSize', tab === 'movements' ? '15' : '50');
      const res = await erpFetchJson<Paginated<MovementRow>>(
        `stock/movements?${params.toString()}`,
      );
      setMovementsData(res);
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Falha ao carregar movimentações.',
      );
      setMovementsData(null);
    } finally {
      setMovementsLoading(false);
    }
  }, [movePage, tab]);

  useEffect(() => {
    if (tab === 'movements' || tab === 'inventory' || tab === 'dashboard') {
      void loadMovements();
    }
  }, [tab, loadMovements]);

  const openCreateProduct = () => {
    setBannerSuccess(null);
    setProductModalMode('create');
    setEditingProduct(null);
    setForm(emptyForm);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: ProductDto) => {
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
        }

        await erpFetchJson(`products/${editingProduct.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
      }

      setProductModalOpen(false);
      await loadSummary();
      if (tab === 'inventory' || tab === 'dashboard') await loadProducts({ page: productPage });
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Erro ao salvar produto.');
    } finally {
      setFormSaving(false);
    }
  };

  const inactivateProduct = async (p: ProductDto) => {
    if (!window.confirm(`Inativar ${p.name}?`)) return;
    setBannerSuccess(null);
    setBannerError(null);
    try {
      await erpFetchJson(`products/${p.id}`, { method: 'DELETE' });
      await loadSummary();
      await loadProducts({
        page: productPage,
        lowStock: false,
      });
    } catch (e) {
      setBannerError(e instanceof Error ? e.message : 'Erro ao inativar.');
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
      await loadProducts({ page: productPage, lowStock: false });
    } catch (e) {
      setBannerError(
        e instanceof Error ? e.message : 'Erro ao alterar status do produto.',
      );
    } finally {
      setTogglingProductId(null);
    }
  };

  const openMoveModal = async (kind: MovementKind, presetProduct?: ProductDto) => {
    setBannerError(null);
    setBannerSuccess(null);
    setMoveForm({
      productId: presetProduct?.id ?? '',
      movementKind: kind,
      quantity: '1',
      notes: '',
      reference: '',
    });
    try {
      const res = await erpFetchJson<Paginated<ProductDto>>(
        'products?status=active&pageSize=50&sortBy=name&sortOrder=asc',
      );
      // Garante que o produto pré-selecionado apareça no picker mesmo fora da 1ª página.
      setProductPicker(
        presetProduct && !res.data.some((p) => p.id === presetProduct.id)
          ? [presetProduct, ...res.data]
          : res.data,
      );
    } catch {
      setProductPicker(presetProduct ? [presetProduct] : []);
    }
    setMoveModalOpen(true);
  };

  const saveMovement = async () => {
    setMoveSaving(true);
    setBannerError(null);
    setBannerSuccess(null);
    try {
      const trimmed = moveForm.quantity.trim();
      const qtyRaw = (() => {
        if (!trimmed) return Number.NaN;
        if (moveForm.movementKind === 'ajuste') {
          if (!/^-?\d+$/.test(trimmed)) return Number.NaN;
          return Number.parseInt(trimmed, 10);
        }
        if (!/^\d+$/.test(trimmed)) return Number.NaN;
        return Number.parseInt(trimmed, 10);
      })();
      if (
        Number.isNaN(qtyRaw) ||
        (moveForm.movementKind !== 'ajuste' && qtyRaw <= 0) ||
        (moveForm.movementKind === 'ajuste' && qtyRaw === 0)
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
          movementType: MOVEMENT_KIND_TO_TYPE[moveForm.movementKind],
          quantity: qtyRaw,
          notes: moveForm.notes.trim() || undefined,
          reference: moveForm.reference.trim() || undefined,
        }),
      });
      setMoveModalOpen(false);
      setBannerError(null);
      setBannerSuccess('Movimentação registrada com sucesso.');
      await loadSummary();
      await loadMovements();
      if (tab === 'inventory' || tab === 'dashboard') await loadProducts({ page: productPage });
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

  const movementRows: TableRow[] = useMemo(() => {
    if (!movementsData) return [];
    return movementsData.data.map((m) => ({
      id: m.id,
      values: {
        date: formatDateTime(m.movementDate),
        type: MOVEMENT_LABEL[m.movementType] ?? m.movementType,
        product: `${m.product.name} (${m.product.sku})`,
        qty: String(m.quantity),
        user: m.movedBy?.name ?? '—',
        notes: m.notes || m.reference || '—',
      },
    }));
  }, [movementsData]);

  const movementItems = useMemo(() => movementsData?.data ?? [], [movementsData]);

  const inventoryProducts = useMemo(() => {
    // Usuário comum nunca vê produtos inativos, mesmo que a API os retorne.
    const base = (productsData?.data ?? []).filter(
      (p) => p.isActive || isAdmin,
    );
    if (inventoryFilter === 'all') return base;
    if (inventoryFilter === 'low') return base.filter((p) => p.stockQty > 0 && p.stockQty <= p.minStock);
    if (inventoryFilter === 'out') return base.filter((p) => p.stockQty <= 0);
    return base.filter((p) =>
      movementItems.some(
        (m) =>
          m.product.id === p.id &&
          (m.movementType === 'TRANSFER' || m.movementType === 'INBOUND') &&
          Date.now() - new Date(m.movementDate).getTime() < 1000 * 60 * 60 * 24 * 7,
      ),
    );
  }, [productsData, isAdmin, inventoryFilter, movementItems]);

  useEffect(() => {
    if (inventoryProducts.length === 0) {
      setSelectedInventoryId(null);
      return;
    }
    if (!selectedInventoryId || !inventoryProducts.some((p) => p.id === selectedInventoryId)) {
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
    const byDay = new Map<string, { in: number; out: number }>();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { in: 0, out: 0 });
    }
    for (const m of movementItems) {
      const key = new Date(m.movementDate).toISOString().slice(0, 10);
      const row = byDay.get(key);
      if (!row) continue;
      if (m.movementType === 'INBOUND') row.in += m.quantity;
      if (m.movementType === 'OUTBOUND') row.out += m.quantity;
    }
    return [...byDay.entries()].map(([date, v]) => ({ date: date.slice(5), ...v }));
  }, [movementItems]);

  const entriesToday = useMemo(() => {
    const now = new Date();
    return movementItems.filter((m) => {
      if (m.movementType !== 'INBOUND') return false;
      const d = new Date(m.movementDate);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [movementItems]);

  const stockTrend30 = useMemo(() => {
    const points: Array<{ label: string; value: number }> = [];
    const today = new Date();
    const byDayDelta = new Map<string, number>();
    for (const m of movementItems) {
      const key = new Date(m.movementDate).toISOString().slice(0, 10);
      const sign =
        m.movementType === 'INBOUND'
          ? 1
          : m.movementType === 'OUTBOUND'
            ? -1
            : 0;
      byDayDelta.set(key, (byDayDelta.get(key) ?? 0) + sign * m.quantity);
    }
    let base = summary?.totalUnitsOnHand ?? 0;
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const delta = byDayDelta.get(key) ?? 0;
      base += delta;
      points.push({ label: key.slice(5), value: Math.max(0, base) });
    }
    return points;
  }, [movementItems, summary]);

  const dashboardTopMoved = useMemo(() => {
    const map = new Map<
      string,
      { sku: string; name: string; n: number; types: Record<string, number> }
    >();
    for (const m of movementItems) {
      const k = m.product.id;
      const cur = map.get(k) ?? {
        sku: m.product.sku,
        name: m.product.name,
        n: 0,
        types: {},
      };
      cur.n += 1;
      cur.types[m.movementType] = (cur.types[m.movementType] ?? 0) + 1;
      map.set(k, cur);
    }
    return [...map.values()]
      .map((x) => ({
        ...x,
        predominant: Object.entries(x.types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ADJUSTMENT',
      }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5);
  }, [movementItems]);

  const dashboardCritical = useMemo(() => {
    return (productsData?.data ?? [])
      .filter((p) => p.stockQty <= p.minStock)
      .sort((a, b) => a.stockQty - b.stockQty)
      .slice(0, 5);
  }, [productsData]);

  const dashboardBarMax = useMemo(
    () => Math.max(1, ...dashboardBars.map((d) => Math.max(d.in, d.out))),
    [dashboardBars],
  );

  const stockTrendChart = useMemo(() => {
    const width = 640;
    const height = 220;
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

  const tabButton = (id: TabId, label: string, icon: ReactNode) => (
    <button
      type="button"
      key={id}
      onClick={() => {
        setTab(id);
        setProductPage(1);
        setMovePage(1);
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

  return (
    <div className="scroll-mt-8 space-y-9 pt-2 sm:space-y-10 sm:pt-6">

      {bannerError ? (
        <GlassCard className="border border-rose-500/30 bg-rose-500/[0.08] px-4 py-3 text-sm text-rose-100">
          {bannerError}
        </GlassCard>
      ) : null}

      {bannerSuccess && !bannerError ? (
        <GlassCard className="border border-emerald-500/35 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-100">
          {bannerSuccess}
        </GlassCard>
      ) : null}

      <GlassCard glow="none" className="flex flex-wrap gap-2 border-white/[0.1] p-3">
        {tabButton(
          'dashboard',
          'Dashboard',
          <BarChart3 className="h-4 w-4 text-violet-300" />,
        )}
        {tabButton(
          'inventory',
          'Inventário',
          <ClipboardList className="h-4 w-4 text-emerald-300" />,
        )}
        {tabButton(
          'movements',
          'Movimentações',
          <ArrowRightLeft className="h-4 w-4 text-violet-300" />,
        )}
      </GlassCard>

      {tab === 'dashboard' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">SKUs Ativos</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{summary?.activeProducts ?? 0}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">produtos ativos</p>
              <Package className="mt-3 h-5 w-5 text-[#5b5ef4]" />
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Total em Estoque</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{summary?.totalUnitsOnHand ?? 0}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">unidades totais</p>
              <TrendingUp className="mt-3 h-5 w-5 text-[#3b82f6]" />
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Crítico</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{summary?.skusBelowMinStock ?? 0}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">abaixo do mínimo</p>
              <AlertTriangle
                className="mt-3 h-5 w-5"
                style={{ color: (summary?.skusBelowMinStock ?? 0) > 0 ? '#ef4444' : '#9ca3af' }}
              />
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 shadow-sm" style={{ boxShadow: 'var(--shadow-card)' }}>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Entradas Hoje</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{entriesToday}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">movimentações</p>
              <PackagePlus className="mt-3 h-5 w-5 text-[#22c55e]" />
            </GlassCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 xl:col-span-7">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Entradas vs Saídas — últimos 7 dias
              </h3>
              <div className="mt-4 space-y-3">
                {dashboardBars.map((d) => (
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
                ))}
              </div>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4 xl:col-span-5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Evolução do estoque (30 dias)</h3>
              <div className="mt-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
                <svg
                  viewBox={`0 0 ${stockTrendChart.width} ${stockTrendChart.height}`}
                  className="h-44 w-full"
                  role="img"
                  aria-label="Evolução do estoque nos últimos 30 dias"
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
                <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>{stockTrend30[0]?.label ?? '—'}</span>
                  <span>
                    min {stockTrendChart.min} · max {stockTrendChart.max}
                  </span>
                  <span>{stockTrend30[stockTrend30.length - 1]?.label ?? '—'}</span>
                </div>
              </div>
            </GlassCard>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">🔥 Mais Movimentados</h3>
              <div className="mt-3 space-y-2">
                {dashboardTopMoved.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Sem movimentações no período.</p>
                ) : (
                  dashboardTopMoved.map((x) => {
                    const predominantLabel = MOVEMENT_LABEL[x.predominant] ?? x.predominant;
                    const predominantClass =
                      x.predominant === 'INBOUND'
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : x.predominant === 'OUTBOUND'
                          ? 'bg-rose-500/20 text-rose-200'
                          : 'bg-zinc-500/20 text-zinc-200';
                    return (
                      <div
                        key={x.sku}
                        className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-[var(--text-primary)]">
                            {x.sku} — {x.name}
                          </span>
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{x.n}</span>
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${predominantClass}`}
                          >
                            {predominantLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </GlassCard>
            <GlassCard className="border-[var(--border-color)] bg-[var(--bg-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">⚠ Estoque Crítico</h3>
              <div className="mt-3 space-y-2">
                {dashboardCritical.length === 0 ? (
                  <p className="text-sm font-medium text-emerald-300">
                    Nenhum SKU em estado crítico ✓
                  </p>
                ) : (
                  dashboardCritical.map((p) => {
                    const isCritical = p.stockQty <= p.minStock;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2"
                      >
                        <div>
                          <p className="text-sm text-[var(--text-primary)]">
                            {p.sku} — {p.name}
                          </p>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Atual: {p.stockQty} | Mínimo: {p.minStock}
                          </p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                            isCritical
                              ? 'bg-rose-500/20 text-rose-200'
                              : 'bg-emerald-500/20 text-emerald-200'
                          }`}
                        >
                          {isCritical ? 'Crítico' : 'OK'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : null}

      {tab === 'movements' ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-white/[0.09] bg-gradient-to-br from-white/[0.04] via-transparent to-violet-500/[0.06] p-4 sm:p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Ações rápidas
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              Escolha o tipo — o formulário abre já configurado (produto, quantidade e motivo).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openMoveModal('entrada')}
                className={`inline-flex min-h-[42px] min-w-[128px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition ${QUICK_ACTION_CLASS.entrada}`}
              >
                <PackagePlus className="h-4 w-4 shrink-0 opacity-90" />
                Entrada
              </button>
              <button
                type="button"
                onClick={() => void openMoveModal('saida')}
                className={`inline-flex min-h-[42px] min-w-[128px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition ${QUICK_ACTION_CLASS.saida}`}
              >
                <PackageMinus className="h-4 w-4 shrink-0 opacity-90" />
                Saída
              </button>
              <button
                type="button"
                onClick={() => void openMoveModal('ajuste')}
                className={`inline-flex min-h-[42px] min-w-[128px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition ${QUICK_ACTION_CLASS.ajuste}`}
              >
                <SlidersHorizontal className="h-4 w-4 shrink-0 opacity-90" />
                Ajuste
              </button>
              <button
                type="button"
                onClick={() => void openMoveModal('reserva')}
                className={`inline-flex min-h-[42px] min-w-[128px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition ${QUICK_ACTION_CLASS.reserva}`}
              >
                <Bookmark className="h-4 w-4 shrink-0 opacity-90" />
                Reserva
              </button>
              <button
                type="button"
                onClick={() => void openMoveModal('cancelamento_reserva')}
                className={`inline-flex min-h-[42px] min-w-[128px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold tracking-tight transition ${QUICK_ACTION_CLASS.cancelamento_reserva}`}
              >
                <Undo2 className="h-4 w-4 shrink-0 opacity-90" />
                Cancelar reserva
              </button>
            </div>
          </div>
          {movementsLoading ? (
            <GlassCard className="flex items-center gap-2 p-8 text-sm text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando movimentações...
            </GlassCard>
          ) : movementsData && movementsData.data.length === 0 ? (
            <EmptyState
              title="Sem movimentações"
              description="Registre entradas, saídas, ajustes ou reservas para alimentar o histórico."
            />
          ) : (
            <>
              <DataTablePremium
                title="Histórico de movimentações"
                subtitle="Tipos, responsáveis e observações."
                columns={movementColumns}
                rows={movementRows}
                showStatusColumn={false}
              />
              {movementsData && movementsData.meta.totalPages > 1 ? (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Página {movementsData.meta.page} de{' '}
                    {movementsData.meta.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <GlowButton
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={movementsData.meta.page <= 1}
                      onClick={() => setMovePage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </GlowButton>
                    <GlowButton
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      disabled={
                        movementsData.meta.page >= movementsData.meta.totalPages
                      }
                      onClick={() => setMovePage((p) => p + 1)}
                    >
                      Próxima
                    </GlowButton>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === 'inventory' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[38fr_62fr]">
          <GlassCard className="flex min-h-[620px] flex-col border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Visão Geral do Estoque - Lista de SKUs</h3>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar SKU ou nome do produto..."
                className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] py-2.5 pl-10 pr-3 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => setInventoryFilter('low')} className={`rounded-full border px-3 py-1 text-xs font-semibold ${inventoryFilter === 'low' ? 'border-transparent bg-[var(--accent)] text-white' : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]'}`}>Baixo Estoque</button>
              <button type="button" onClick={() => setInventoryFilter('out')} className={`rounded-full border px-3 py-1 text-xs font-semibold ${inventoryFilter === 'out' ? 'border-transparent bg-[var(--accent)] text-white' : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]'}`}>Sem Estoque</button>
              <button type="button" onClick={() => setInventoryFilter('transit')} className={`rounded-full border px-3 py-1 text-xs font-semibold ${inventoryFilter === 'transit' ? 'border-transparent bg-[var(--accent)] text-white' : 'border-[var(--border-color)] bg-transparent text-[var(--text-secondary)]'}`}>Em Trânsito</button>
              {isAdmin ? (
                <label className="ml-auto inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[var(--border-color)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
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
            <div className="erp-scrollbar mt-3 grid flex-1 auto-rows-max grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {inventoryProducts.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedInventoryId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedInventoryId(p.id);
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
                        <span className="shrink-0 rounded-full border border-rose-300 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-500 dark:border-rose-400/25 dark:bg-rose-500/20 dark:text-rose-200">
                          Inativo
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{p.stockQty}</p>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className={`rounded-full border px-2 py-0.5 ${
                        p.stockQty <= 0
                          ? 'border-rose-300 bg-rose-500/10 text-rose-500 dark:border-rose-400/25 dark:bg-rose-500/20 dark:text-rose-200'
                          : p.stockQty <= p.minStock
                            ? 'border-amber-300 bg-amber-500/10 text-amber-600 dark:border-amber-400/25 dark:bg-amber-500/20 dark:text-amber-200'
                            : 'border-[#86efac] bg-[#dcfce7] text-[#16a34a] dark:border-transparent dark:bg-[#22c55e20] dark:text-[#22c55e]'
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
                        onClick={() => void toggleProductActive(p)}
                        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium transition hover:bg-[var(--input-bg)] ${p.isActive ? 'text-rose-400' : 'text-emerald-400'}`}
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
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">Operador 1 | Filial Londrina</p>
          </GlassCard>

          <GlassCard className="min-h-[620px] p-4">
            {selectedInventoryProduct ? (
              <>
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#1e2130]">
                      <Package className="h-7 w-7 text-[#5b5ef4]" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-[var(--text-primary)]">
                        SKU #{selectedInventoryProduct.sku} — {selectedInventoryProduct.name}
                      </p>
                      <p className="mt-1 text-xs">
                        <span className="text-[var(--text-secondary)]">Fornecedor:</span>{' '}
                        <span className="text-[var(--text-primary)]">{selectedInventoryProduct.category ?? 'Não informado'}</span>{' '}
                        <span className="mx-1 text-[var(--text-secondary)]">|</span>
                        <span className="text-[var(--text-secondary)]">Ponto:</span>{' '}
                        <span className="text-[var(--text-primary)]">MAT</span>
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                      selectedInventoryProduct.stockQty <= 0
                        ? 'border border-rose-300 bg-rose-500/10 text-rose-500 dark:border-rose-400/25 dark:bg-rose-500/20 dark:text-rose-200'
                        : selectedInventoryProduct.stockQty <= selectedInventoryProduct.minStock
                          ? 'border border-amber-300 bg-amber-500/10 text-amber-600 dark:border-amber-400/25 dark:bg-amber-500/20 dark:text-amber-200'
                          : 'border border-[#86efac] bg-[#dcfce7] text-[#16a34a] dark:border-transparent dark:bg-[#22c55e20] dark:text-[#22c55e]'
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
                <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      <PackagePlus className="h-4 w-4 text-[#22c55e]" />
                      Entradas
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{selectedMovementStats.inbound}</p>
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
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{selectedMovementStats.outbound}</p>
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
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{selectedInventoryProduct.stockQty}</p>
                      <MiniGauge
                        value={selectedInventoryProduct.stockQty}
                        max={selectedGaugeMax.availableMax}
                        color="#3b82f6"
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">disponível</p>
                  </div>
                  <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                      <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
                      Estoque mín.
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                      <p className="text-2xl font-bold text-[var(--text-primary)]">{selectedInventoryProduct.minStock}</p>
                      <MiniGauge value={selectedInventoryProduct.minStock} max={selectedGaugeMax.minMax} color="#f59e0b" />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">configurado</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Tabela de Movimentações Recentes</p>
                  <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead className="bg-[var(--input-bg)] text-xs text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-3 py-2">Data/Hora</th>
                          <th className="px-3 py-2">Tipo de Movimento</th>
                          <th className="px-3 py-2">Quantidade</th>
                          <th className="px-3 py-2">Referência</th>
                          <th className="px-3 py-2">Responsável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMovements.map((m, idx) => (
                          <tr
                            key={m.id}
                            className={`border-b border-[var(--border-color)] ${idx % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--input-bg)]'}`}
                          >
                            <td className="px-3 py-2 text-[var(--text-primary)]">{formatDateTime(m.movementDate)}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-1 text-xs ${
                                m.movementType === 'INBOUND' ? 'bg-emerald-500/20 text-[var(--text-primary)]' :
                                m.movementType === 'OUTBOUND' ? 'bg-rose-500/20 text-[var(--text-primary)]' :
                                m.movementType === 'ADJUSTMENT' ? 'bg-amber-500/20 text-[var(--text-primary)]' :
                                'bg-violet-500/20 text-[var(--text-primary)]'
                              }`}>
                                {MOVEMENT_LABEL[m.movementType] ?? m.movementType}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{m.quantity}</td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">{m.reference ?? '—'}</td>
                            <td className="px-3 py-2 text-[var(--text-primary)]">
                              {m.movedBy?.name ?? currentUserName ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-4 flex w-full gap-3">
                  <button
                    type="button"
                    onClick={() => void openMoveModal('entrada', selectedInventoryProduct)}
                    className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl bg-[var(--success)] px-4 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    → Entrada de Estoque
                  </button>
                  <button
                    type="button"
                    onClick={() => void openMoveModal('ajuste', selectedInventoryProduct)}
                    className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl bg-[var(--warning)] px-4 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    ⇄ Ajuste de Estoque
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('movements')}
                    className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    📋 Histórico Completo
                  </button>
                </div>
              </>
            ) : (
              <EmptyState title="Selecione um SKU" description="Escolha um item na lista para ver os detalhes." />
            )}
          </GlassCard>
        </div>
      ) : null}

      {productModalOpen ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setProductModalOpen(false)}
        >
          <div className="h-[100dvh] w-screen max-w-none sm:h-auto sm:w-full sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
            <GlassCard className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none p-6 shadow-2xl sm:max-h-[90vh] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-2xl">
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
            <p className="mt-1 text-xs text-zinc-500">
              SKU é o identificador principal. Campos com * são obrigatórios.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs text-zinc-400 sm:col-span-2">
                Nome *
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-zinc-400 sm:col-span-1">
                SKU *
                <input
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
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
              <label className="block text-xs text-zinc-400 sm:col-span-1">
                Preço (R$) *
                <input
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-zinc-400 sm:col-span-1">
                Custo (R$)
                <input
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2 text-base text-[var(--text-primary)] outline-none"
                />
              </label>
              <label className="block text-xs text-zinc-400 sm:col-span-2">
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
            <GlassCard className="h-[100dvh] w-screen max-w-none overflow-y-auto rounded-none border-white/[0.12] p-6 shadow-[0_0_48px_-12px_rgba(56,189,248,0.25)] sm:max-h-[92vh] sm:h-auto sm:w-full sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                    {MOVE_MODAL_TITLE[moveForm.movementKind]}
                  </h2>
                  <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-200/90">
                    {MOVEMENT_KIND_CHIP[moveForm.movementKind]}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
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
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Produto *
                <div className="mt-1.5">
                  <PremiumSelect
                    value={moveForm.productId}
                    onChange={(productId) =>
                      setMoveForm((f) => ({ ...f, productId }))
                    }
                    options={productSelectOptions}
                    placeholder="Selecione um produto…"
                    placement="above"
                  />
                </div>
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Quantidade *
                <input
                  value={moveForm.quantity}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  placeholder={
                    moveForm.movementKind === 'ajuste'
                      ? 'Ex.: +10 ou -5'
                      : 'Inteiro positivo'
                  }
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent placeholder:text-[var(--text-muted)] focus:border-sky-400/40 focus:ring-sky-400/20"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Referência / documento
                <input
                  value={moveForm.reference}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, reference: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent focus:border-white/[0.18]"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                Observação / motivo
                <textarea
                  value={moveForm.notes}
                  onChange={(e) =>
                    setMoveForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  className="mt-1.5 w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--input-bg)] px-3 py-2.5 text-base text-[var(--text-primary)] outline-none ring-1 ring-transparent focus:border-white/[0.18]"
                />
              </label>
              <p className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
                Em <span className="text-zinc-400">ajuste</span>, use quantidade
                negativa para reduzir o saldo (bloqueado se ficar abaixo de zero).
                Reserva e saída exigem saldo suficiente.
              </p>
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
                onClick={() => void saveMovement()}
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
    </div>
  );
}
