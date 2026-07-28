import { jsPDF } from 'jspdf';

export type ColetaListaItem = {
  productName: string;
  totalQty: number;
};

export function downloadColetaListaPdf(opts: {
  items: ColetaListaItem[];
  orderCount: number;
  generatedAt?: Date;
}) {
  const { items, orderCount, generatedAt = new Date() } = opts;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `LISTA DE COLETA — ${generatedAt.toLocaleString('pt-BR')}`,
    margin,
    y,
  );
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Pedidos selecionados: ${orderCount}`, margin, y);
  y += 8;

  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFontSize(11);
  for (const item of items) {
    ensureSpace(8);
    const line = `${item.productName} — ${item.totalQty} unidades`;
    const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
    doc.text(wrapped, margin, y);
    y += wrapped.length * 6 + 2;
  }

  const stamp = generatedAt
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');
  doc.save(`lista-coleta-${stamp}.pdf`);
}
