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
import {
  calcQuoteItemLineTotalDecimal,
  calcQuoteItemUnitPriceDecimal,
  DEFAULT_SALES_MARGIN_PERCENT,
  roundMoneyDecimal,
  toDecimal,
} from './quote-pricing.util';

export type QuoteProposalSnapshotItem = {
  sku: string;
  description: string;
  imageUrl: string | null;
  engraving: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
  width?: string | null;
  length?: string | null;
  height?: string | null;
  weight?: string | null;
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
  difalValue?: string;
  otherExtraCosts?: string;
  total: string;
  observations: string | null;
  customerNotes: string | null;
  validityDays: number;
  validUntil: string;
  items: QuoteProposalSnapshotItem[];
  generatedAt: string;
  responsibleName?: string | null;
  responsibleEmail?: string | null;
  responsiblePhone?: string | null;
};

const MARGIN = 48;
const ACCENT = '#2AACE2';
const INK = '#111827';
const MUTED = '#6b7280';

const COMPANY_LEGAL_NAME = 'ENERGY BRANDS COMERCIO E SERVICOS LTDA';
const COMPANY_CNPJ = '48.783.884/0001-24';

const FIXED_OBSERVATIONS = [
  {
    title: 'Validade do orçamento',
    paragraphs: [
      'O orçamento é válido por 4 dias úteis ou enquanto durarem os estoques. Os valores são proporcionais à quantidade e tipo de personalização solicitada. Qualquer alteração pode gerar mudanças no orçamento.',
    ],
  },
  {
    title: 'Formas de Pagamento',
    bullets: [
      'À vista: boleto bancário ou PIX',
      'Parcelado sem juros: em até 2x no cartão de crédito',
      'Parcelado com juros: de 3x a 12x no cartão de crédito',
    ],
  },
  {
    title: 'Frete',
    paragraphs: [
      'O custo do frete é por conta do cliente e será calculado com base no local de entrega, prazo, peso e volume do pedido. O valor exato será informado após a definição dos itens e quantidades.',
    ],
  },
  {
    title: 'Prazo de Produção',
    bullets: [
      'Para materiais não têxteis, o prazo é de 8 a 16 dias úteis, variando conforme quantidade e complexidade, contados a partir da aprovação do layout e confirmação do pagamento. Se precisar de um prazo menor, avaliamos a viabilidade.',
      'Para materiais têxteis, como bonés, chapéu, camisas e camisetas, o prazo atual é de 30 a 45 dias úteis, podendo variar conforme a época do ano.',
    ],
  },
  {
    title: 'Requisitos para a Logo',
    bullets: [
      'É necessário enviar a logo em formato vetorizado de alta qualidade para impressão, caso contrário não conseguimos garantir a qualidade da personalização. Formatos aceitos: AI, CDR, SVG, PDF, PSD, entre outros.',
      'Caso não possua logo em formato vetor, oferecemos o serviço de vetorização por R$59,00 por logo.',
      'Caso não tenha a arte definida, oferecemos o serviço de design e criação por R$120,00 por arte, com até 2 ajustes sutis.',
    ],
  },
];

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

  private dimValue(raw: string | null | undefined): string | null {
    if (raw == null || raw === '') return null;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return null;
    const rounded = Math.round(n * 1000) / 1000;
    return String(rounded);
  }

  /** Linhas de detalhes técnicos — omite campos sem valor. */
  private techDetailLines(item: QuoteProposalSnapshotItem): string[] {
    const lines: string[] = [];
    const width = this.dimValue(item.width);
    const length = this.dimValue(item.length);
    const height = this.dimValue(item.height);
    const weight = this.dimValue(item.weight);
    if (width) lines.push(`Largura: ${width} cm`);
    if (length) lines.push(`Comprimento: ${length} cm`);
    if (height) lines.push(`Espessura: ${height} cm`);
    if (weight) lines.push(`Peso aproximado(g): ${weight}`);
    return lines;
  }

  private async fetchImageBuffer(url: string | null): Promise<Buffer | null> {
    if (!url?.trim()) return null;
    try {
      const res = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 6000,
        validateStatus: (s) => s >= 200 && s < 300,
        maxRedirects: 3,
      });
      const buf = Buffer.from(res.data);
      return buf.length > 0 ? buf : null;
    } catch {
      return null;
    }
  }

  private async buildSnapshot(
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
      difalValue?: Prisma.Decimal | null;
      otherExtraCosts?: Prisma.Decimal | null;
      commissionPercent?: Prisma.Decimal | null;
      marginReservePercent?: Prisma.Decimal | null;
      salesMarginPercent?: Prisma.Decimal | null;
      total: Prisma.Decimal;
      observations: string | null;
      customerNotes: string | null;
      responsibleUserId: string | null;
      items: Array<{
        sku: string;
        description: string;
        imageUrl: string | null;
        engraving: string | null;
        quantity: number;
        productPrice?: Prisma.Decimal | null;
        engravingPrice?: Prisma.Decimal | null;
        unitPrice: Prisma.Decimal;
        total: Prisma.Decimal;
      }>;
    },
    validityDays: number,
  ): Promise<QuoteProposalSnapshot> {
    const generatedAt = new Date();
    const validUntil = new Date(generatedAt);
    validUntil.setDate(validUntil.getDate() + validityDays);

    let responsibleName: string | null = null;
    let responsibleEmail: string | null = null;
    if (quote.responsibleUserId) {
      const user = await this.prisma.client.user.findUnique({
        where: { id: quote.responsibleUserId },
        select: { name: true, email: true },
      });
      responsibleName = user?.name ?? null;
      responsibleEmail = user?.email ?? null;
    }

    const skus = [...new Set(quote.items.map((i) => i.sku).filter(Boolean))];
    const catalogRows =
      skus.length > 0
        ? await this.prisma.client.quoteCatalogProduct.findMany({
            where: { supplierCode: { in: skus } },
            select: {
              supplierCode: true,
              imageUrl: true,
              width: true,
              depth: true,
              height: true,
              weight: true,
            },
          })
        : [];
    const catalogBySku = new Map(
      catalogRows.map((r) => [r.supplierCode, r] as const),
    );

    const commission = toDecimal(quote.commissionPercent, 2);
    const reserve = toDecimal(quote.marginReservePercent, 6);
    const sales = toDecimal(
      quote.salesMarginPercent,
      DEFAULT_SALES_MARGIN_PERCENT,
    );
    const difal = toDecimal(quote.difalValue);
    const otherExtras = toDecimal(quote.otherExtraCosts);

    let subtotalPrecise = new Prisma.Decimal(0);
    const pricedItems = quote.items.map((item) => {
      const cat = catalogBySku.get(item.sku);
      const qty = item.quantity > 0 ? item.quantity : 1;
      const engravingPrice = item.engravingPrice ?? null;

      let finalUnit = roundMoneyDecimal(item.unitPrice, 2);
      let finalTotal = roundMoneyDecimal(item.total, 2);

      // Com productPrice: sempre recalcula venda (margem por dentro)
      if (item.productPrice != null) {
        finalUnit = roundMoneyDecimal(
          calcQuoteItemUnitPriceDecimal({
            productPrice: item.productPrice,
            engravingPrice,
            commissionPercent: commission,
            marginReservePercent: reserve,
            salesMarginPercent: sales,
            quantity: qty,
            difalValue: difal,
            otherExtraCosts: otherExtras,
          }),
          2,
        );
        finalTotal = calcQuoteItemLineTotalDecimal({
          productPrice: item.productPrice,
          engravingPrice,
          commissionPercent: commission,
          marginReservePercent: reserve,
          salesMarginPercent: sales,
          quantity: qty,
          difalValue: difal,
          otherExtraCosts: otherExtras,
        });
      }

      subtotalPrecise = subtotalPrecise.add(finalTotal);

      return {
        sku: item.sku,
        description: item.description,
        imageUrl: item.imageUrl?.trim() || cat?.imageUrl || null,
        engraving: item.engraving,
        quantity: item.quantity,
        unitPrice: finalUnit.toFixed(2),
        total: finalTotal.toFixed(2),
        width: cat?.width?.toString() ?? null,
        length: cat?.depth?.toString() ?? null,
        height: cat?.height?.toString() ?? null,
        weight: cat?.weight?.toString() ?? null,
      };
    });

    const freight = quote.freightToConsult
      ? new Prisma.Decimal(0)
      : toDecimal(quote.freightValue);
    const subtotal = roundMoneyDecimal(subtotalPrecise, 2);
    const total = roundMoneyDecimal(subtotal.add(freight), 2);

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
      subtotal: subtotal.toString(),
      difalValue: quote.difalValue?.toString() ?? '0',
      otherExtraCosts: quote.otherExtraCosts?.toString() ?? '0',
      total: total.toString(),
      observations: quote.observations,
      customerNotes: quote.customerNotes,
      validityDays,
      validUntil: validUntil.toISOString(),
      generatedAt: generatedAt.toISOString(),
      responsibleName,
      responsibleEmail,
      responsiblePhone: process.env.QUOTE_COMPANY_PHONE?.trim() || null,
      items: pricedItems,
    };
  }

  async generatePdfFromSnapshot(snapshot: QuoteProposalSnapshot): Promise<Buffer> {
    const imageBuffers = await Promise.all(
      snapshot.items.map((item) => this.fetchImageBuffer(item.imageUrl)),
    );

    const doc = new PDFDocument({
      margin: MARGIN,
      size: 'A4',
      autoFirstPage: true,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const logoPath = this.resolveLogoPath();
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;
    const bottomLimit = () =>
      doc.page.height - doc.page.margins.bottom;

    const THUMB = 60;
    const THUMB_GAP = 10;
    const COL_GAP = 12;
    const productColX = left + THUMB + THUMB_GAP;
    const detailsWidth = Math.floor(pageWidth * 0.22);
    const priceWidth = Math.floor(pageWidth * 0.22);
    const productWidth =
      pageWidth - THUMB - THUMB_GAP - detailsWidth - priceWidth - COL_GAP * 2;
    const detailsColX = productColX + productWidth + COL_GAP;
    const priceColX = detailsColX + detailsWidth + COL_GAP;

    let y = doc.page.margins.top;

    const drawPageHeader = (continuation: boolean) => {
      y = doc.page.margins.top;
      const headerTop = y;
      const companyBlockWidth = Math.min(280, pageWidth * 0.55);

      if (logoPath) {
        try {
          doc.image(logoPath, left, headerTop, { width: 110 });
        } catch {
          doc.fontSize(16).font('Helvetica-Bold').fillColor(INK);
          doc.text('Energy Brands', left, headerTop);
        }
      } else {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(INK);
        doc.text('Energy Brands', left, headerTop);
      }

      doc.font('Helvetica-Bold').fontSize(8).fillColor(INK);
      doc.text(COMPANY_LEGAL_NAME, left + pageWidth - companyBlockWidth, headerTop, {
        width: companyBlockWidth,
        align: 'right',
      });
      doc.font('Helvetica').fontSize(8).fillColor(MUTED);
      doc.text(COMPANY_CNPJ, left + pageWidth - companyBlockWidth, headerTop + 12, {
        width: companyBlockWidth,
        align: 'right',
      });

      y = headerTop + 48;

      doc.fontSize(14).font('Helvetica-Bold').fillColor(ACCENT);
      doc.text(
        continuation
          ? 'Proposta Comercial - continuação'
          : 'PROPOSTA COMERCIAL',
        left,
        y,
      );
      y += 20;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#d1d5db').stroke();
      y += 14;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed <= bottomLimit()) return;
      doc.addPage();
      drawPageHeader(true);
    };

    const writeWrapped = (
      text: string,
      opts: {
        fontSize?: number;
        font?: string;
        color?: string;
        indent?: number;
        gapAfter?: number;
      } = {},
    ) => {
      const fontSize = opts.fontSize ?? 9;
      const font = opts.font ?? 'Helvetica';
      const color = opts.color ?? INK;
      const indent = opts.indent ?? 0;
      const gapAfter = opts.gapAfter ?? 4;
      const width = pageWidth - indent;
      doc.font(font).fontSize(fontSize).fillColor(color);
      const h = doc.heightOfString(text, { width, align: 'left' });
      ensureSpace(h + gapAfter + 2);
      doc.text(text, left + indent, y, { width, align: 'left' });
      y += h + gapAfter;
    };

    const metaLine = (label: string, value: string) => {
      ensureSpace(14);
      const line = `${label}  ${value || '—'}`;
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      doc.text(line, left, y, { width: pageWidth });
      y += 13;
    };

    const measureColText = (
      lines: Array<{ text: string; font: string; size: number }>,
      width: number,
    ) => {
      let h = 0;
      for (const line of lines) {
        doc.font(line.font).fontSize(line.size);
        h += doc.heightOfString(line.text, { width }) + 2;
      }
      return h;
    };

    const drawLabeledValue = (
      x: number,
      startY: number,
      width: number,
      label: string,
      value: string,
    ) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
      const labelH = doc.heightOfString(label, { width });
      doc.text(label, x, startY, { width, lineBreak: false });
      const valueY = startY + labelH + 2;
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      const valueH = doc.heightOfString(value, { width });
      doc.text(value, x, valueY, { width });
      return valueY + valueH - startY;
    };

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawPageHeader(false);

      metaLine('ORÇAMENTO', snapshot.quoteCode);
      metaLine('DATA DO ENVIO', formatPtDate(new Date(snapshot.generatedAt)));
      metaLine('RESPONSÁVEL', snapshot.responsibleName ?? '—');
      metaLine('E-MAIL', snapshot.responsibleEmail ?? '—');
      metaLine('TELEFONE', snapshot.responsiblePhone ?? '—');
      y += 8;

      ensureSpace(40);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
      doc.text('CLIENTE', left, y);
      y += 16;
      metaLine('NOME', snapshot.customerName);
      metaLine('E-MAIL', snapshot.customerEmail ?? '—');
      y += 10;

      ensureSpace(28);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED);
      doc.text('PRODUTO', productColX, y, { width: productWidth });
      doc.text('DETALHES', detailsColX, y, { width: detailsWidth });
      doc.text('PREÇO E QUANT.', priceColX, y, { width: priceWidth });
      y += 14;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e5e7eb').stroke();
      y += 12;

      snapshot.items.forEach((item, index) => {
        const techLines = this.techDetailLines(item);
        const productLines: Array<{ text: string; font: string; size: number }> = [
          { text: item.description, font: 'Helvetica-Bold', size: 10 },
          { text: item.sku, font: 'Helvetica', size: 9 },
          ...techLines.map((t) => ({
            text: t,
            font: 'Helvetica' as const,
            size: 8,
          })),
        ];
        const productH = measureColText(productLines, productWidth);
        const engraving = item.engraving?.trim() || '';
        const detailsH = engraving
          ? measureColText(
              [
                { text: 'Gravação', font: 'Helvetica-Bold', size: 9 },
                { text: engraving, font: 'Helvetica', size: 9 },
              ],
              detailsWidth,
            )
          : 0;
        const priceH = measureColText(
          [
            { text: `Quant.: ${item.quantity} unid.`, font: 'Helvetica', size: 9 },
            {
              text: `Preço unit.: ${formatBrl(item.unitPrice)}`,
              font: 'Helvetica',
              size: 9,
            },
            {
              text: `Preço total: ${formatBrl(item.total)}`,
              font: 'Helvetica-Bold',
              size: 9,
            },
          ],
          priceWidth,
        );

        const rowH = Math.max(THUMB, productH, detailsH, priceH) + 14;
        ensureSpace(rowH + 8);

        const rowTop = y;
        const imgBuf = imageBuffers[index];

        if (imgBuf) {
          try {
            doc.image(imgBuf, left, rowTop, {
              fit: [THUMB, THUMB],
            });
          } catch {
            doc
              .rect(left, rowTop, THUMB, THUMB)
              .strokeColor('#e5e7eb')
              .stroke();
          }
        } else {
          doc
            .rect(left, rowTop, THUMB, THUMB)
            .fillColor('#f3f4f6')
            .fill()
            .strokeColor('#e5e7eb')
            .stroke();
        }

        let py = rowTop;
        doc.font('Helvetica-Bold').fontSize(10).fillColor(INK);
        const nameH = doc.heightOfString(item.description, {
          width: productWidth,
        });
        doc.text(item.description, productColX, py, { width: productWidth });
        py += nameH + 2;

        doc.font('Helvetica').fontSize(9).fillColor(INK);
        doc.text(item.sku, productColX, py, { width: productWidth });
        py += 12;

        if (techLines.length > 0) {
          doc.font('Helvetica').fontSize(8).fillColor('#374151');
          for (const line of techLines) {
            const lh = doc.heightOfString(line, { width: productWidth });
            doc.text(line, productColX, py, { width: productWidth });
            py += lh + 1;
          }
        }

        if (engraving) {
          drawLabeledValue(
            detailsColX,
            rowTop,
            detailsWidth,
            'Gravação',
            engraving,
          );
        }

        let pry = rowTop;
        const priceLines: Array<{ label: string; value: string; bold?: boolean }> =
          [
            { label: 'Quant.:', value: `${item.quantity} unid.` },
            { label: 'Preço unit.:', value: formatBrl(item.unitPrice) },
            {
              label: 'Preço total:',
              value: formatBrl(item.total),
              bold: true,
            },
          ];
        for (const pl of priceLines) {
          doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
          const labelW = doc.widthOfString(pl.label + ' ');
          doc.text(pl.label, priceColX, pry, { lineBreak: false });
          doc
            .font(pl.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9)
            .fillColor(INK);
          doc.text(` ${pl.value}`, priceColX + labelW, pry, {
            width: priceWidth - labelW,
          });
          pry += 13;
        }

        y = rowTop + rowH;
        doc
          .moveTo(left, y)
          .lineTo(left + pageWidth, y)
          .strokeColor('#e5e7eb')
          .stroke();
        y += 10;
      });

      ensureSpace(28);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK);
      doc.text(`Subtotal: ${formatBrl(snapshot.subtotal)}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 22;

      ensureSpace(30);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK);
      doc.text('Observações', left, y);
      y += 16;

      for (const section of FIXED_OBSERVATIONS) {
        ensureSpace(28);
        writeWrapped(section.title, {
          fontSize: 10,
          font: 'Helvetica-Bold',
          gapAfter: 6,
        });
        if (section.paragraphs) {
          for (const p of section.paragraphs) {
            writeWrapped(p, { fontSize: 8, color: '#374151', gapAfter: 5 });
          }
        }
        if (section.bullets) {
          for (const b of section.bullets) {
            writeWrapped(`• ${b}`, {
              fontSize: 8,
              color: '#374151',
              indent: 6,
              gapAfter: 5,
            });
          }
        }
        y += 6;
      }

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
    const snapshot = await this.buildSnapshot(quote, validityDays);

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
