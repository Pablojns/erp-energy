import { jsPDF } from 'jspdf';
import type { PedidoParaImpressao } from '@/src/utils/print-waybill';

function formatDateBr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function drawPedidoPage(doc: jsPDF, pedido: PedidoParaImpressao, pageIndex: number) {
  if (pageIndex > 0) doc.addPage();

  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  let y = margin;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ERP Energy', margin, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Romaneio de Entrega', pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text(`Pedido: ${pedido.numero}`, pageW - margin, y, { align: 'right' });
  y += 5;
  doc.text(
    `Gerado: ${new Date().toLocaleString('pt-BR')}`,
    pageW - margin,
    y,
    { align: 'right' },
  );

  y += 8;
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  doc.setFontSize(9);
  const infoLines = [
    [`Cliente:`, pedido.cliente],
    [`Recebedor:`, pedido.recebedor || pedido.cliente],
    [`Ponto de Descarga:`, pedido.pontoDescarga],
    [`Data de Entrega:`, formatDateBr(pedido.dataEntrega)],
  ];
  for (const [label, value] of infoLines) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 38, y);
    y += 5.5;
  }

  y += 4;
  const colSku = margin;
  const colDesc = margin + 32;
  const colQty = pageW - margin - 12;

  doc.setFont('helvetica', 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F');
  doc.text('SKU', colSku, y);
  doc.text('Descrição', colDesc, y);
  doc.text('Qtd', colQty, y, { align: 'right' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  let totalQty = 0;
  for (const item of pedido.itens) {
    if (y > 260) {
      doc.addPage();
      y = margin;
    }
    const desc =
      item.descricao.length > 72
        ? `${item.descricao.slice(0, 69)}…`
        : item.descricao;
    doc.text(item.sku, colSku, y);
    doc.text(desc, colDesc, y);
    doc.text(String(item.quantidade), colQty, y, { align: 'right' });
    totalQty += item.quantidade;
    y += 5.5;
  }

  y += 3;
  doc.setFont('helvetica', 'bold');
  doc.text('Total de Itens:', colDesc, y);
  doc.text(String(totalQty), colQty, y, { align: 'right' });

  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.line(pageW - margin - 55, y, pageW - margin, y);
  y += 4;
  doc.text('Assinatura do Recebedor', pageW - margin - 27.5, y, { align: 'center' });
}

export function downloadWaybillPdf(pedidos: PedidoParaImpressao[]): void {
  if (pedidos.length === 0) return;

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  pedidos.forEach((pedido, index) => drawPedidoPage(doc, pedido, index));

  const filename =
    pedidos.length === 1
      ? `${pedidos[0].numero}.pdf`
      : `romaneio_${new Date().toISOString().slice(0, 10)}.pdf`;

  doc.save(filename);
}
