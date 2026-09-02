/**
 * Rótulo e código exibidos para itens de catálogo do fornecedor.
 *
 * Itens XBZ exibem o código composto (CodigoComposto) sob o rótulo "SAP".
 * Qualquer outra origem (SPOT, manual) mantém o código do fornecedor sob "SKU".
 */

export function isXbzSupplier(supplier: string | null | undefined): boolean {
  return supplier?.trim().toUpperCase() === 'XBZ';
}

export type SupplierCodeDisplay = { label: string; code: string };

/**
 * Se o item é XBZ e tem código composto, devolve SAP + código composto.
 * Sem código composto (nem todo item XBZ tem), cai no comportamento antigo:
 * SKU + código do fornecedor.
 */
export function supplierCodeDisplay(input: {
  supplier: string | null | undefined;
  supplierCode: string | null | undefined;
  compositeCode: string | null | undefined;
}): SupplierCodeDisplay {
  const composite = input.compositeCode?.trim();
  if (isXbzSupplier(input.supplier) && composite) {
    return { label: 'SAP', code: composite };
  }
  return { label: 'SKU', code: input.supplierCode?.trim() || '—' };
}

/** Versão pronta para exibição: "SAP - 123" / "SKU - X231240". */
export function supplierCodeLabel(input: {
  supplier: string | null | undefined;
  supplierCode: string | null | undefined;
  compositeCode: string | null | undefined;
}): string {
  const { label, code } = supplierCodeDisplay(input);
  return `${label} - ${code}`;
}

/**
 * Código gravado após selecionar no catálogo: composto (SAP) quando existe,
 * senão o código do fornecedor (SPOT e XBZ sem composto).
 */
export function catalogCodeToSave(input: {
  supplierCode: string | null | undefined;
  compositeCode: string | null | undefined;
}): string {
  return input.compositeCode?.trim() || input.supplierCode?.trim() || '';
}
