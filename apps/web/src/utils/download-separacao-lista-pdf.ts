export type SeparacaoListaLine = {
  orderNumber: string;
  productSku: string;
  productName: string;
  pickedQty: number;
  volumes: number | null;
};

export async function downloadSeparacaoListaPdf(opts: {
  lines: SeparacaoListaLine[];
  orderCount: number;
  generatedAt?: Date;
}): Promise<void> {
  const { lines, orderCount, generatedAt = new Date() } = opts;
  const { jsPDF } = await import('jspdf');
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
    `LISTA DE ITENS SEPARADOS — ${generatedAt.toLocaleString('pt-BR')}`,
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

  let lastOrder = '';
  for (const line of lines) {
    if (line.orderNumber !== lastOrder) {
      ensureSpace(14);
      if (lastOrder) y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      const vol =
        line.volumes != null && line.volumes > 0
          ? ` — ${line.volumes} volume(s)`
          : '';
      doc.text(`Pedido ${line.orderNumber}${vol}`, margin, y);
      y += 7;
      lastOrder = line.orderNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    ensureSpace(8);
    const name = line.productName.trim() || line.productSku;
    const skuBit = line.productSku.trim() ? ` [${line.productSku.trim()}]` : '';
    const text = `• ${name}${skuBit} — ${line.pickedQty} un.`;
    const wrapped = doc.splitTextToSize(text, pageW - margin * 2);
    doc.text(wrapped, margin + 2, y);
    y += wrapped.length * 5.5 + 1.5;
  }

  if (lines.length === 0) {
    doc.setFontSize(11);
    doc.text('Nenhum item separado nos pedidos selecionados.', margin, y);
  }

  const stamp = generatedAt
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-');
  doc.save(`lista-separacao-${stamp}.pdf`);
}
