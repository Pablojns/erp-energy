export {
  formatCurrency,
  formatYmd,
  resolvePeriodRange,
} from '@/src/components/dashboard/utils';

export function ultimaNF(invoiceNumber: string): string {
  const partes = invoiceNumber.split('|');
  return partes[partes.length - 1].trim();
}

export function formatDateBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function categoriaLabel(categoria: string): string {
  const map: Record<string, string> = {
    FRETE: 'Frete',
    MATERIAL: 'Material',
    OPERACIONAL: 'Operacional',
    OUTROS: 'Outros',
  };
  return map[categoria] ?? categoria;
}

export function categoriaTone(
  categoria: string,
): 'info' | 'warning' | 'accent' | 'neutral' {
  switch (categoria) {
    case 'FRETE':
      return 'info';
    case 'MATERIAL':
      return 'warning';
    case 'OPERACIONAL':
      return 'accent';
    default:
      return 'neutral';
  }
}
