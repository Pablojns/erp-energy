export interface ItemPedido {
  sku: string;
  descricao: string;
  quantidade: number;
}

export interface PedidoParaImpressao {
  id: string;
  numero: string;
  cliente: string;
  recebedor?: string;
  pontoDescarga: string;
  dataEntrega: string;
  itens: ItemPedido[];
}

function generateWaybillHTML(pedidos: PedidoParaImpressao[]): string {
  const dataGeracao = new Date().toLocaleString('pt-BR');

  const pedidosHTML = pedidos
    .map(
      (pedido) => `
    <div class="page">
      <div class="header">
        <div class="logo">Energy Brands</div>
        <div class="meta">
          <p><strong>Romaneio de Entrega</strong></p>
          <p>Data: ${dataGeracao}</p>
          <p>Pedido: ${pedido.numero}</p>
        </div>
      </div>

      <div class="info-block">
        <div class="info-row">
          <div class="info-item">
            <label>Cliente:</label>
            <span>${pedido.cliente}</span>
          </div>
          <div class="info-item">
            <label>Recebedor:</label>
            <span>${pedido.recebedor || pedido.cliente}</span>
          </div>
        </div>
        <div class="info-row">
          <div class="info-item">
            <label>Ponto de Descarga:</label>
            <span>${pedido.pontoDescarga}</span>
          </div>
          <div class="info-item">
            <label>Data de Entrega:</label>
            <span>${new Date(pedido.dataEntrega).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Descrição</th>
            <th class="text-right">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${pedido.itens
            .map(
              (item) => `
            <tr>
              <td>${item.sku}</td>
              <td>${item.descricao}</td>
              <td class="text-right">${item.quantidade}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>Total de Itens:</strong></td>
            <td class="text-right"><strong>${pedido.itens.reduce((acc, item) => acc + item.quantidade, 0)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div class="footer">
        <div class="signature-block">
          <div class="signature-line">
            <span>Assinatura do Recebedor</span>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Romaneio de Entrega - Energy Brands</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Arial', sans-serif;
          font-size: 12px;
          color: #333;
          line-height: 1.4;
        }

        .page {
          page-break-after: always;
          padding: 20px;
          min-height: 100vh;
        }

        .page:last-child {
          page-break-after: auto;
        }

        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 15px;
          margin-bottom: 20px;
        }

        .logo {
          font-size: 24px;
          font-weight: bold;
          color: #000;
        }

        .meta {
          text-align: right;
          font-size: 11px;
        }

        .info-block {
          margin-bottom: 20px;
          border: 1px solid #ccc;
          padding: 15px;
          border-radius: 4px;
        }

        .info-row {
          display: flex;
          gap: 30px;
          margin-bottom: 10px;
        }

        .info-row:last-child {
          margin-bottom: 0;
        }

        .info-item {
          flex: 1;
        }

        .info-item label {
          display: block;
          font-weight: bold;
          font-size: 10px;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .items-table th,
        .items-table td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }

        .items-table th {
          background-color: #f0f0f0;
          font-weight: bold;
        }

        .text-right {
          text-align: right !important;
        }

        .footer {
          margin-top: 40px;
          border-top: 1px solid #ccc;
          padding-top: 20px;
        }

        .signature-block {
          width: 250px;
          margin-left: auto;
        }

        .signature-line {
          border-bottom: 1px solid #000;
          padding-bottom: 5px;
          margin-bottom: 5px;
        }

        .signature-line span {
          font-size: 10px;
          color: #666;
        }

        @media print {
          @page {
            margin: 0;
            size: A4;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .page {
            page-break-after: always;
          }
        }
      </style>
    </head>
    <body>
      ${pedidosHTML}
    </body>
    </html>
  `;
}

export function printWaybill(pedidos: PedidoParaImpressao[]): void {
  if (pedidos.length === 0) return;

  const html = generateWaybillHTML(pedidos);
  const printWindow = window.open('', '_blank', 'width=800,height=600');

  if (!printWindow) {
    alert(
      'Bloqueador de pop-ups detectado. Por favor, permita pop-ups para este site.',
    );
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.print();
  };
}
