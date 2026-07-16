import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import { formatBrl, formatPtDate } from '../crm/crm-proposta.util';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

export type QuoteProposalSnapshotItem = {
  sku: string;
  description: string;
  imageUrl: string | null;
  engraving: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
};

export type QuoteProposalSnapshot = {
  quoteCode: string;
  requestDate: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerDocument: string | null;
  billingCompany: string | null;
  paymentTerms: string | null;
  paymentMethod: string | null;
  deliveryDeadline: string | null;
  freightValue: string;
  freightToConsult: boolean;
  freightType: string | null;
  subtotal: string;
  total: string;
  observations: string | null;
  customerNotes: string | null;
  validityDays: number;
  validUntil: string;
  items: QuoteProposalSnapshotItem[];
  generatedAt: string;
};

@Injectable()
export class QuoteProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private resolveLogoPath(): string | null {
    const candidates = [
      path.join(__dirname, '..', '..', 'assets', 'energy-brands-logo.png'),
      path.join(process.cwd(), 'apps', 'api', 'assets', 'energy-brands-logo.png'),
      path.join(process.cwd(), 'assets', 'energy-brands-logo.png'),
      path.join(
        process.cwd(),
        'apps',
        'web',
        'public',
        'brand',
        'energy-brands-logo.png',
      ),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  private serializeProposal(row: {
    id: string;
    quoteId: string;
    sentAt: Date | null;
    emailSent: boolean;
    createdBy: string | null;
    contactName: string | null;
    contactEmail: string | null;
    total: Prisma.Decimal;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      quoteId: row.quoteId,
      sentAt: row.sentAt?.toISOString() ?? null,
      emailSent: row.emailSent,
      createdBy: row.createdBy,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      total: row.total.toString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private buildSnapshot(
    quote: {
      code: string;
      requestDate: Date;
      customerName: string;
      customerEmail: string | null;
      customerPhone: string | null;
      customerDocument: string | null;
      billingCompany: string | null;
      paymentTerms: string | null;
      paymentMethod: string | null;
      deliveryDeadline: string | null;
      freightValue: Prisma.Decimal | null;
      freightToConsult: boolean;
      freightType: string | null;
      subtotal: Prisma.Decimal;
      total: Prisma.Decimal;
      observations: string | null;
      customerNotes: string | null;
      items: Array<{
        sku: string;
        description: string;
        imageUrl: string | null;
        engraving: string | null;
        quantity: number;
        unitPrice: Prisma.Decimal;
        total: Prisma.Decimal;
      }>;
    },
    validityDays: number,
  ): QuoteProposalSnapshot {
    const generatedAt = new Date();
    const validUntil = new Date(generatedAt);
    validUntil.setDate(validUntil.getDate() + validityDays);

    return {
      quoteCode: quote.code,
      requestDate: quote.requestDate.toISOString(),
      customerName: quote.customerName,
      customerEmail: quote.customerEmail,
      customerPhone: quote.customerPhone,
      customerDocument: quote.customerDocument,
      billingCompany: quote.billingCompany,
      paymentTerms: quote.paymentTerms,
      paymentMethod: quote.paymentMethod,
      deliveryDeadline: quote.deliveryDeadline,
      freightValue: quote.freightValue?.toString() ?? '0',
      freightToConsult: quote.freightToConsult,
      freightType: quote.freightType,
      subtotal: quote.subtotal.toString(),
      total: quote.total.toString(),
      observations: quote.observations,
      customerNotes: quote.customerNotes,
      validityDays,
      validUntil: validUntil.toISOString(),
      generatedAt: generatedAt.toISOString(),
      items: quote.items.map((item) => ({
        sku: item.sku,
        description: item.description,
        imageUrl: item.imageUrl,
        engraving: item.engraving,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        total: item.total.toString(),
      })),
    };
  }

  private async fetchImageBuffer(url: string | null): Promise<Buffer | null> {
    if (!url?.trim()) return null;
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 5000,
        validateStatus: (s) => s >= 200 && s < 300,
      });
      return Buffer.from(res.data);
    } catch {
      return null;
    }
  }

  async generatePdfFromSnapshot(snapshot: QuoteProposalSnapshot): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const imageBuffers = await Promise.all(
      snapshot.items.map((item) => this.fetchImageBuffer(item.imageUrl)),
    );

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let y = doc.page.margins.top;

      const logoPath = this.resolveLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, left, y, { width: 120 });
          y += 48;
        } catch {
          doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827');
          doc.text('Energy Brands', left, y);
          y += 26;
        }
      } else {
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#111827');
        doc.text('Energy Brands', left, y);
        y += 26;
      }

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2AACE2');
      doc.text('Proposta Comercial — Brindes Corporativos', left, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280');
      doc.text(
        `Orçamento ${snapshot.quoteCode} · Emitida em ${formatPtDate(new Date(snapshot.generatedAt))}`,
        left,
        y,
      );
      y += 18;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#d1d5db').stroke();
      y += 14;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Dados do cliente', left, y);
      y += 16;
      doc.fontSize(9).font('Helvetica').fillColor('#1f2937');
      const clientLines = [
        `Nome: ${snapshot.customerName}`,
        `Documento: ${snapshot.customerDocument ?? '—'}`,
        `E-mail: ${snapshot.customerEmail ?? '—'}`,
        `Telefone: ${snapshot.customerPhone ?? '—'}`,
        `Empresa faturamento: ${snapshot.billingCompany ?? '—'}`,
      ];
      for (const line of clientLines) {
        doc.text(line, left, y);
        y += 12;
      }
      y += 10;

      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Produtos', left, y);
      y += 14;

      const colWidths = [
        pageWidth * 0.08,
        pageWidth * 0.12,
        pageWidth * 0.28,
        pageWidth * 0.16,
        pageWidth * 0.08,
        pageWidth * 0.13,
        pageWidth * 0.15,
      ];
      const headers = [
        'Img',
        'SKU',
        'Descrição',
        'Gravação',
        'Qtd',
        'Unit.',
        'Total',
      ];
      const colX = colWidths.reduce<number[]>((acc, _w, i) => {
        acc.push(i === 0 ? left : acc[i - 1]! + colWidths[i - 1]!);
        return acc;
      }, []);

      const ensureSpace = (needed: number) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if (y + needed > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
      };

      ensureSpace(30);
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
      headers.forEach((header, index) => {
        doc.text(header, colX[index], y, {
          width: colWidths[index] - 2,
          lineBreak: false,
        });
      });
      y += 12;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e5e7eb').stroke();
      y += 6;

      doc.font('Helvetica').fillColor('#111827');
      snapshot.items.forEach((item, index) => {
        const imgBuf = imageBuffers[index];
        const descHeight = doc.heightOfString(item.description, {
          width: colWidths[2]! - 2,
        });
        const engHeight = doc.heightOfString(item.engraving || '—', {
          width: colWidths[3]! - 2,
        });
        const rowHeight = Math.max(28, descHeight, engHeight, 12) + 6;
        ensureSpace(rowHeight + 8);

        if (imgBuf) {
          try {
            doc.image(imgBuf, colX[0], y, { width: 22, height: 22 });
          } catch {
            doc.fontSize(7).text('—', colX[0], y + 6, { width: colWidths[0]! - 2 });
          }
        } else {
          doc.fontSize(7).text('—', colX[0], y + 6, { width: colWidths[0]! - 2 });
        }

        doc.fontSize(8);
        doc.text(item.sku, colX[1], y, { width: colWidths[1]! - 2 });
        doc.text(item.description, colX[2], y, { width: colWidths[2]! - 2 });
        doc.text(item.engraving || '—', colX[3], y, { width: colWidths[3]! - 2 });
        doc.text(String(item.quantity), colX[4], y, { width: colWidths[4]! - 2 });
        doc.text(formatBrl(item.unitPrice), colX[5], y, { width: colWidths[5]! - 2 });
        doc.text(formatBrl(item.total), colX[6], y, { width: colWidths[6]! - 2 });
        y += rowHeight;
      });

      y += 8;
      ensureSpace(90);
      doc.fontSize(9).font('Helvetica').fillColor('#1f2937');
      doc.text(`Subtotal: ${formatBrl(snapshot.subtotal)}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 13;
      const freightLabel = snapshot.freightToConsult
        ? 'A consultar'
        : formatBrl(snapshot.freightValue);
      doc.text(`Frete: ${freightLabel}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 15;
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827');
      doc.text(`Total geral: ${formatBrl(snapshot.total)}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 22;

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Condições', left, y);
      y += 14;
      doc.fontSize(9).font('Helvetica').fillColor('#1f2937');
      doc.text(`Condição de pagamento: ${snapshot.paymentTerms ?? '—'}`, left, y);
      y += 12;
      doc.text(`Forma de pagamento: ${snapshot.paymentMethod ?? '—'}`, left, y);
      y += 12;
      doc.text(`Prazo de entrega: ${snapshot.deliveryDeadline ?? '—'}`, left, y);
      y += 12;
      if (snapshot.freightType) {
        doc.text(`Tipo de frete: ${snapshot.freightType}`, left, y);
        y += 12;
      }
      y += 8;

      const footerY = doc.page.height - doc.page.margins.bottom - 20;
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280');
      doc.text(
        `Proposta válida até ${formatPtDate(new Date(snapshot.validUntil))}`,
        left,
        footerY,
        { width: pageWidth, align: 'center' },
      );

      doc.end();
    });
  }

  async list(quoteId: string) {
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      select: { id: true },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');

    const rows = await this.prisma.client.quoteProposal.findMany({
      where: { quoteId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeProposal(row));
  }

  async create(
    quoteId: string,
    options: {
      createdBy?: string | null;
      contactName?: string | null;
      contactEmail?: string | null;
      validityDays?: number;
    } = {},
  ) {
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Orçamento não encontrado.');
    if (quote.items.length === 0) {
      throw new BadRequestException(
        'Inclua ao menos um produto antes de gerar a proposta.',
      );
    }

    const validityDays =
      options.validityDays && options.validityDays > 0
        ? options.validityDays
        : 15;
    const snapshot = this.buildSnapshot(quote, validityDays);

    const created = await this.prisma.client.quoteProposal.create({
      data: {
        quoteId,
        createdBy: options.createdBy?.trim() || null,
        contactName:
          options.contactName?.trim() || quote.customerName || null,
        contactEmail:
          options.contactEmail?.trim() || quote.customerEmail || null,
        total: quote.total,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    const pdf = await this.generatePdfFromSnapshot(snapshot);
    return {
      proposal: this.serializeProposal(created),
      pdf,
      filename: `proposta-${quote.code}-${created.id.slice(-6)}.pdf`,
    };
  }

  async getPdf(quoteId: string, proposalId: string) {
    const proposal = await this.prisma.client.quoteProposal.findFirst({
      where: { id: proposalId, quoteId },
    });
    if (!proposal) throw new NotFoundException('Proposta não encontrada.');

    const snapshot = proposal.snapshot as QuoteProposalSnapshot | null;
    if (!snapshot || !snapshot.items) {
      throw new BadRequestException(
        'Proposta sem snapshot — gere uma nova proposta.',
      );
    }

    const pdf = await this.generatePdfFromSnapshot(snapshot);
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      select: { code: true },
    });
    return {
      pdf,
      filename: `proposta-${quote?.code ?? quoteId}-${proposalId.slice(-6)}.pdf`,
      proposal: this.serializeProposal(proposal),
    };
  }

  async sendEmail(
    quoteId: string,
    proposalId: string,
    input: { to: string; contactName?: string | null },
  ) {
    const to = input.to?.trim();
    if (!to || !to.includes('@')) {
      throw new BadRequestException('Informe um e-mail de destino válido.');
    }

    const { pdf, filename, proposal } = await this.getPdf(quoteId, proposalId);
    const quote = await this.prisma.client.quote.findUnique({
      where: { id: quoteId },
      select: { code: true, customerName: true },
    });

    const subject = 'Proposta comercial - Brindes Corporativos';
    const contactName =
      input.contactName?.trim() || proposal.contactName || quote?.customerName || 'cliente';

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; max-width: 560px;">
        <div style="padding: 16px 0; border-bottom: 3px solid #2AACE2;">
          <h1 style="margin: 0; font-size: 20px; color: #0f172a;">Energy Brands</h1>
          <p style="margin: 4px 0 0; color: #2AACE2; font-size: 13px;">Brindes Corporativos</p>
        </div>
        <p style="margin-top: 20px;">Olá, <strong>${contactName}</strong>,</p>
        <p>Segue em anexo a proposta comercial referente ao orçamento <strong>${quote?.code ?? ''}</strong>.</p>
        <p>Total: <strong>${formatBrl(proposal.total)}</strong></p>
        <p style="color: #4b5563; font-size: 13px;">Qualquer dúvida, estamos à disposição.</p>
        <p style="margin-top: 28px; font-size: 13px;">
          Atenciosamente,<br/>
          <strong>Equipe Energy Brands</strong>
        </p>
      </div>
    `;

    await this.mail.sendMail({
      to,
      subject,
      html,
      text: `Olá ${contactName}, segue a proposta comercial do orçamento ${quote?.code ?? ''}. Total: ${formatBrl(proposal.total)}.`,
      attachments: [
        {
          filename,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    const updated = await this.prisma.client.quoteProposal.update({
      where: { id: proposalId },
      data: {
        emailSent: true,
        sentAt: new Date(),
        contactEmail: to,
        contactName: contactName || null,
      },
    });

    return this.serializeProposal(updated);
  }
}
