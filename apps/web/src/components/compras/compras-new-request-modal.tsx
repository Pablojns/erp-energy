'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Plus, X } from 'lucide-react';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { erpFetchFormData } from './compras-api';
import { ComprasModalShell } from './compras-modal-shell';
import type {
  ProductListResponse,
  PurchasePriority,
  PurchaseRequest,
  PurchaseType,
  SupplierLite,
} from './compras-types';
import { fieldClass, formatMoneyNumber, productMatchesSearch } from './compras-utils';

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 10;

type ImageDraft = {
  id: string;
  file: File;
  preview: string;
};

function createImageDraft(file: File): ImageDraft {
  return {
    id: crypto.randomUUID(),
    file,
    preview: URL.createObjectURL(file),
  };
}

export function ComprasNewRequestModal(props: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { onClose, onCreated } = props;
  const [type, setType] = useState<PurchaseType>('WEG_CONTRATO');
  const [priority, setPriority] = useState<PurchasePriority>('NORMAL');
  const [products, setProducts] = useState<ProductListResponse['data']>([]);
  const [suppliers, setSuppliers] = useState<SupplierLite[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [suggestedQty, setSuggestedQty] = useState('1');
  const [supplierMode, setSupplierMode] = useState<'select' | 'text'>('select');
  const [supplierName, setSupplierName] = useState('');
  const [sku, setSku] = useState('');
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [clientDeadline, setClientDeadline] = useState('');
  const [link, setLink] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [engravingPrice, setEngravingPrice] = useState('');
  const [saleOrderRef, setSaleOrderRef] = useState('');
  const [observation, setObservation] = useState('');
  const [imageDrafts, setImageDrafts] = useState<ImageDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const isWeg = type === 'WEG_CONTRATO';
  const isMarketplace = type === 'MARKETPLACE';

  const handleTypeChange = (nextType: PurchaseType) => {
    setType(nextType);
    setItemPrice('');
    setQuantity('');
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingProducts(true);
    void erpFetchJson<ProductListResponse>(
      'products?page=1&pageSize=100&status=active&sortBy=name&sortOrder=asc',
    )
      .then((res) => {
        if (!cancelled) setProducts(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    void erpFetchJson<SupplierLite[]>('cadastros/suppliers')
      .then((rows) => {
        if (!cancelled) setSuppliers(rows.filter((row) => row.isActive));
      })
      .catch(() => {
        if (!cancelled) setSuppliers([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      imageDrafts.forEach((draft) => URL.revokeObjectURL(draft.preview));
    };
  }, [imageDrafts]);

  const selectedProduct = products.find((product) => product.id === productId) ?? null;

  useEffect(() => {
    if (!selectedProduct) return;
    setSuggestedQty(String(Math.max(1, selectedProduct.minStock - selectedProduct.stockQty)));
    if (selectedProduct.price) {
      setItemPrice(selectedProduct.price);
    }
  }, [selectedProduct]);

  const lineQty = isWeg ? Number(suggestedQty) : Number(quantity);
  const calculatedTotal = useMemo(() => {
    const price = itemPrice ? Number(itemPrice) : 0;
    if (!Number.isFinite(lineQty) || lineQty <= 0 || !Number.isFinite(price) || price <= 0) {
      return null;
    }
    return lineQty * price;
  }, [itemPrice, lineQty]);

  const filteredProducts = useMemo(
    () => products.filter((product) => productMatchesSearch(product, productSearch)),
    [productSearch, products],
  );

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;

    const nextErrors: string[] = [];
    const nextDrafts: ImageDraft[] = [];

    for (const file of Array.from(files)) {
      if (imageDrafts.length + nextDrafts.length >= MAX_IMAGES) {
        nextErrors.push(`Máximo de ${MAX_IMAGES} imagens.`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        nextErrors.push(`${file.name}: selecione uma imagem.`);
        continue;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        nextErrors.push(`${file.name}: máximo 10MB.`);
        continue;
      }
      nextDrafts.push(createImageDraft(file));
    }

    if (nextDrafts.length) {
      setImageDrafts((current) => [...current, ...nextDrafts]);
    }

    setErrors((prev) => {
      const next = { ...prev };
      if (nextErrors.length) next.images = nextErrors[0];
      else delete next.images;
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImageDrafts((current) => {
      const draft = current.find((item) => item.id === id);
      if (draft) URL.revokeObjectURL(draft.preview);
      return current.filter((item) => item.id !== id);
    });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (isWeg) {
      if (!productId) next.productId = 'Selecione um produto.';
      if (!Number.isInteger(Number(suggestedQty)) || Number(suggestedQty) < 1) {
        next.suggestedQty = 'Informe uma quantidade mínima de 1.';
      }
    } else {
      if (!itemName.trim()) next.itemName = 'Informe o nome do item.';
      if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
        next.quantity = 'Informe uma quantidade mínima de 1.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const appendCommonFields = (formData: FormData) => {
    formData.set('type', type);
    formData.set('priority', priority);
    if (!isWeg && supplierName.trim()) {
      formData.set('supplierName', supplierName.trim());
    }
    if (itemPrice) formData.set('itemPrice', itemPrice);
    if (!isWeg && engravingPrice) formData.set('engravingPrice', engravingPrice);
    if (isMarketplace && saleOrderRef.trim()) {
      formData.set('saleOrderRef', saleOrderRef.trim());
    }
    if (observation.trim()) formData.set('observation', observation.trim());
    imageDrafts.forEach((draft) => formData.append('images', draft.file));
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setErrors({});
    try {
      const formData = new FormData();
      appendCommonFields(formData);

      if (isWeg) {
        formData.set('productId', productId);
        formData.set('suggestedQty', suggestedQty);
      } else {
        if (sku.trim()) formData.set('sku', sku.trim());
        formData.set('itemName', itemName.trim());
        formData.set('quantity', quantity);
        if (clientDeadline) formData.set('clientDeadline', clientDeadline);
        if (link.trim()) formData.set('link', link.trim());
      }

      await erpFetchFormData<PurchaseRequest>('api/compras', formData);
      onCreated();
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : 'Falha ao criar solicitação.' });
    } finally {
      setSaving(false);
    }
  };

  const supplierField = (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-white/70">Fornecedor</span>
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => setSupplierMode('select')}
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
            supplierMode === 'select' ? 'bg-white text-slate-950' : 'text-white/55'
          }`}
        >
          Cadastro
        </button>
        <button
          type="button"
          onClick={() => setSupplierMode('text')}
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${
            supplierMode === 'text' ? 'bg-white text-slate-950' : 'text-white/55'
          }`}
        >
          Texto livre
        </button>
      </div>
      {supplierMode === 'select' ? (
        <select
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          className={fieldClass()}
        >
          <option value="">Selecione...</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.name}>
              {supplier.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
          className={fieldClass()}
          placeholder="Nome do fornecedor"
        />
      )}
    </label>
  );

  const imagesField = (
    <div>
      <span className="mb-1 block text-sm font-medium text-white/70">
        Imagens (opcional, até {MAX_IMAGES}, max 10MB cada)
      </span>
      <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-3">
        <div className="flex flex-wrap gap-3">
          {imageDrafts.map((draft) => (
            <div key={draft.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.preview}
                alt="Preview"
                className="h-24 w-24 rounded-lg border border-white/10 object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(draft.id)}
                className="absolute -right-2 -top-2 rounded-full bg-black/80 p-1 text-white"
                aria-label="Remover imagem"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {imageDrafts.length < MAX_IMAGES ? (
            <label className="inline-flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/20 text-xs text-white/60 transition hover:bg-white/10">
              <ImagePlus className="h-5 w-5" />
              Adicionar
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addImages(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
      </div>
      {errors.images ? <p className="mt-1 text-xs text-rose-300">{errors.images}</p> : null}
    </div>
  );

  return (
    <ComprasModalShell title="Nova Solicitação" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['WEG_CONTRATO', 'WEG Contrato', 'border-blue-400 bg-blue-500/20 text-blue-100'],
              ['VENDA_EXTERNA', 'Venda Externa', 'border-orange-400 bg-orange-500/20 text-orange-100'],
              ['MARKETPLACE', 'Marketplace', 'border-purple-400 bg-purple-500/20 text-purple-100'],
            ] as const
          ).map(([value, label, activeClass]) => (
            <button
              key={value}
              type="button"
              onClick={() => handleTypeChange(value)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                type === value ? activeClass : 'border-white/10 bg-white/5 text-white/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isWeg ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">Produto</span>
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className={fieldClass(Boolean(errors.productId))}
                placeholder={loadingProducts ? 'Carregando produtos...' : 'Buscar produto por SKU ou nome'}
              />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-black/20">
                {filteredProducts.slice(0, 50).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      setProductId(product.id);
                      setProductSearch(`${product.sku} — ${product.name}`);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
                      product.id === productId ? 'bg-indigo-500/20 text-white' : 'text-white/75'
                    }`}
                  >
                    <span className="font-semibold">{product.sku}</span> — {product.name}
                    <span className="ml-2 text-xs text-white/45">
                      Estoque {product.stockQty} · Mín. {product.minStock}
                    </span>
                  </button>
                ))}
              </div>
              {errors.productId ? <p className="mt-1 text-xs text-rose-300">{errors.productId}</p> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">Quantidade sugerida</span>
              <input
                type="number"
                min={1}
                value={suggestedQty}
                onChange={(e) => setSuggestedQty(e.target.value)}
                className={fieldClass(Boolean(errors.suggestedQty))}
              />
              {errors.suggestedQty ? (
                <p className="mt-1 text-xs text-rose-300">{errors.suggestedQty}</p>
              ) : null}
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">SKU (opcional)</span>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={fieldClass()} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">Nome do item</span>
              <input
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                className={fieldClass(Boolean(errors.itemName))}
              />
              {errors.itemName ? <p className="mt-1 text-xs text-rose-300">{errors.itemName}</p> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">Quantidade</span>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={fieldClass(Boolean(errors.quantity))}
              />
              {errors.quantity ? <p className="mt-1 text-xs text-rose-300">{errors.quantity}</p> : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-white/70">Data entrega cliente</span>
              <input
                type="date"
                value={clientDeadline}
                onChange={(e) => setClientDeadline(e.target.value)}
                className={fieldClass()}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-white/70">Link (opcional)</span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className={fieldClass()}
                placeholder="https://..."
              />
            </label>
            <div className="sm:col-span-2">{supplierField}</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {isWeg ? (
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[10rem] flex-1">
                  <span className="mb-1 block text-sm font-medium text-white/70">Preço item</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className={fieldClass()}
                  />
                </label>
                <div className="flex shrink-0 items-center gap-1.5 pb-2.5">
                  <span className="text-sm text-white/70">
                    Total:{' '}
                    <span className="font-semibold text-white">
                      {formatMoneyNumber(calculatedTotal)}
                    </span>
                  </span>
                  <span
                    title="Quantidade × preço item (não salvo)"
                    className="cursor-help text-sm text-white/45"
                    aria-label="Quantidade × preço item (não salvo)"
                  >
                    ⓘ
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-white/70">Preço item</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  className={fieldClass()}
                  placeholder="0,00"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-white/70">Preço gravação</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={engravingPrice}
                  onChange={(e) => setEngravingPrice(e.target.value)}
                  className={fieldClass()}
                  placeholder="0,00"
                />
              </label>
              <div className="flex items-center gap-1.5 sm:col-span-2">
                <span className="text-sm text-white/70">
                  Total:{' '}
                  <span className="font-semibold text-white">
                    {formatMoneyNumber(calculatedTotal)}
                  </span>
                </span>
                <span
                  title="Quantidade × preço item (não salvo)"
                  className="cursor-help text-sm text-white/45"
                  aria-label="Quantidade × preço item (não salvo)"
                >
                  ⓘ
                </span>
              </div>
            </>
          )}
          {isMarketplace ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-white/70">Referência pedido venda</span>
              <input
                value={saleOrderRef}
                onChange={(e) => setSaleOrderRef(e.target.value)}
                className={fieldClass()}
              />
            </label>
          ) : null}
        </div>

        {!isWeg ? imagesField : null}

        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div>
            <span className="mb-1 block text-sm font-medium text-white/70">Prioridade</span>
            <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">
              {(['NORMAL', 'URGENTE'] as PurchasePriority[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    priority === value ? 'bg-white text-slate-950' : 'text-white/60'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-white/70">Observação</span>
            <textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className={`${fieldClass()} min-h-20 resize-none`}
            />
          </label>
        </div>
      </div>

      {errors.form ? <p className="mt-3 text-sm text-rose-300">{errors.form}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar Solicitação
        </button>
      </div>
    </ComprasModalShell>
  );
}
