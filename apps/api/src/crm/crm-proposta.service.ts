import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@erp/database';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateCrmPropostaDto,
  UpdateCrmPropostaDto,
} from './dto/crm-proposta-item.dto';
import {
  calcItemTotal,
  calcPropostaTotal,
  decimalFromNumber,
  formatBrl,
  formatPtDate,
  isCrmPropostaStatus,
} from './crm-proposta.util';

type PropostaItemRow = {
  id: string;
  propostaId: string;
  descricao: string;
  quantidade: number;
  valorUnit: Prisma.Decimal;
  desconto: Prisma.Decimal;
  total: Prisma.Decimal;
};

type PropostaRow = {
  id: string;
  cardId: string;
  numero: string;
  titulo: string;
  validade: Date | null;
  status: string;
  observacoes: string | null;
  desconto: Prisma.Decimal | null;
  total: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
  itens: PropostaItemRow[];
  card: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
};

const propostaInclude = {
  itens: { orderBy: { id: 'asc' as const } },
  card: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  },
};

type CrmPropostaDb = {
  findFirst: (args: unknown) => Promise<{ numero: string } | null>;
  findUnique: (args: unknown) => Promise<PropostaRow | null>;
  findMany: (args: unknown) => Promise<PropostaRow[]>;
  create: (args: unknown) => Promise<PropostaRow>;
  update: (args: unknown) => Promise<PropostaRow>;
  delete: (args: unknown) => Promise<unknown>;
};

type CrmPropostaItemDb = {
  deleteMany: (args: unknown) => Promise<unknown>;
};

@Injectable()
export class CrmPropostaService {
  constructor(private readonly prisma: PrismaService) {}

  private db() {
    return this.prisma.client as unknown as {
      crmProposta: CrmPropostaDb;
      crmPropostaItem: CrmPropostaItemDb;
      crmCard: {
        findUnique: (args: unknown) => Promise<{ id: string } | null>;
        update: (args: unknown) => Promise<unknown>;
      };
      $transaction: <T>(
        fn: (tx: {
          crmProposta: CrmPropostaDb;
          crmPropostaItem: CrmPropostaItemDb;
          crmCard: { update: (args: unknown) => Promise<unknown> };
        }) => Promise<T>,
      ) => Promise<T>;
    };
  }

  private serializeItem(row: PropostaItemRow) {
    return {
      id: row.id,
      propostaId: row.propostaId,
      descricao: row.descricao,
      quantidade: row.quantidade,
      valorUnit: row.valorUnit.toString(),
      desconto: row.desconto.toString(),
      total: row.total.toString(),
    };
  }

  private serializeProposta(row: PropostaRow) {
    return {
      id: row.id,
      cardId: row.cardId,
      numero: row.numero,
      titulo: row.titulo,
      validade: row.validade?.toISOString() ?? null,
      status: row.status,
      observacoes: row.observacoes,
      desconto: row.desconto?.toString() ?? '0',
      total: row.total?.toString() ?? '0',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      itens: row.itens.map((item) => this.serializeItem(item)),
      card: row.card,
    };
  }

  private parseValidade(value?: string | null): Date | null {
    if (!value?.trim()) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Data de validade inválida.');
    }
    return date;
  }

  private validateItens(itens: CreateCrmPropostaDto['itens']) {
    if (!itens?.length) {
      throw new BadRequestException('Informe ao menos um item na proposta.');
    }
    for (const item of itens) {
      if (!item.descricao?.trim()) {
        throw new BadRequestException('Descrição do item é obrigatória.');
      }
    }
  }

  private buildItemRows(itens: CreateCrmPropostaDto['itens']) {
    return itens.map((item) => {
      const total = calcItemTotal(item);
      return {
        descricao: item.descricao.trim(),
        quantidade: item.quantidade,
        valorUnit: decimalFromNumber(item.valorUnit),
        desconto: decimalFromNumber(item.desconto ?? 0),
        total: decimalFromNumber(total),
      };
    });
  }

  private async nextNumero(tx: { crmProposta: CrmPropostaDb }): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    const last = await tx.crmProposta.findFirst({
      where: { numero: { startsWith: prefix } },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const seq = last ? Number.parseInt(last.numero.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async getPropostaOrThrow(id: string) {
    const row = await this.db().crmProposta.findUnique({
      where: { id },
      include: propostaInclude,
    });
    if (!row) throw new NotFoundException('Proposta não encontrada.');
    return row;
  }

  async listByCard(cardId: string) {
    const card = await this.db().crmCard.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException('Lead não encontrado.');

    const rows = await this.db().crmProposta.findMany({
      where: { cardId },
      include: propostaInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.serializeProposta(row));
  }

  async getById(id: string) {
    const row = await this.getPropostaOrThrow(id);
    return this.serializeProposta(row);
  }

  async create(cardId: string, dto: CreateCrmPropostaDto) {
    const card = await this.db().crmCard.findUnique({
      where: { id: cardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException('Lead não encontrado.');

    this.validateItens(dto.itens);
    const itemRows = this.buildItemRows(dto.itens);
    const { total } = calcPropostaTotal(dto.itens, dto.desconto ?? 0);
    const validade = this.parseValidade(dto.validade);

    const created = await this.db().$transaction(async (tx) => {
      const numero = await this.nextNumero(tx);
      return tx.crmProposta.create({
        data: {
          cardId,
          numero,
          titulo: dto.titulo.trim(),
          validade,
          observacoes: dto.observacoes?.trim() || null,
          desconto: decimalFromNumber(dto.desconto ?? 0),
          total: decimalFromNumber(total),
          itens: { create: itemRows },
        },
        include: propostaInclude,
      });
    });

    return this.serializeProposta(created);
  }

  async update(id: string, dto: UpdateCrmPropostaDto) {
    const existing = await this.getPropostaOrThrow(id);

    if (dto.status != null && !isCrmPropostaStatus(dto.status)) {
      throw new BadRequestException('Status de proposta inválido.');
    }

    const itensInput =
      dto.itens ??
      existing.itens.map((item) => ({
        descricao: item.descricao,
        quantidade: item.quantidade,
        valorUnit: Number(item.valorUnit),
        desconto: Number(item.desconto),
      }));

    if (dto.itens) this.validateItens(dto.itens);

    const descontoPct =
      dto.desconto != null ? dto.desconto : Number(existing.desconto ?? 0);
    const { total } = calcPropostaTotal(itensInput, descontoPct);
    const validade =
      dto.validade !== undefined
        ? this.parseValidade(dto.validade)
        : existing.validade;

    const updated = await this.db().$transaction(async (tx) => {
      if (dto.itens) {
        await tx.crmPropostaItem.deleteMany({ where: { propostaId: id } });
      }

      const row = await tx.crmProposta.update({
        where: { id },
        data: {
          titulo: dto.titulo?.trim() ?? existing.titulo,
          validade,
          observacoes:
            dto.observacoes !== undefined
              ? dto.observacoes?.trim() || null
              : existing.observacoes,
          desconto: decimalFromNumber(descontoPct),
          total: decimalFromNumber(total),
          status: dto.status ?? existing.status,
          ...(dto.itens
            ? { itens: { create: this.buildItemRows(dto.itens) } }
            : {}),
        },
        include: propostaInclude,
      });

      if (dto.status === 'ACEITA') {
        await tx.crmCard.update({
          where: { id: row.cardId },
          data: { value: decimalFromNumber(total) },
        });
      }

      return row;
    });

    return this.serializeProposta(updated);
  }

  async delete(id: string) {
    await this.getPropostaOrThrow(id);
    await this.db().crmProposta.delete({ where: { id } });
    return { ok: true };
  }

  async markAceita(id: string) {
    return this.update(id, { status: 'ACEITA' });
  }

  async generatePdf(id: string): Promise<Buffer> {
    const proposta = await this.getPropostaOrThrow(id);
    const subtotal = proposta.itens.reduce(
      (acc: number, item: PropostaItemRow) => acc + Number(item.total),
      0,
    );
    const descontoPct = Number(proposta.desconto ?? 0);
    const descontoValor = subtotal - Number(proposta.total ?? 0);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    return new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;
      let y = doc.page.margins.top;

      doc.fontSize(22).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Energy Brands', left, y);
      y += 28;
      doc.fontSize(10).font('Helvetica').fillColor('#374151');
      doc.text('Proposta Comercial', left, y);
      y += 14;
      doc.text('CNPJ: 00.000.000/0001-00 · contato@energybrands.com.br', left, y);
      y += 14;
      doc.text('energybrands.com.br · (43) 0000-0000', left, y);
      y += 24;

      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#d1d5db').stroke();
      y += 16;

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Dados do cliente', left, y);
      y += 18;
      doc.fontSize(10).font('Helvetica').fillColor('#1f2937');
      doc.text(`Nome: ${proposta.card.name}`, left, y);
      y += 14;
      doc.text('CNPJ/CPF: —', left, y);
      y += 14;
      doc.text(`Telefone: ${proposta.card.phone ?? '—'}`, left, y);
      y += 14;
      doc.text(`E-mail: ${proposta.card.email ?? '—'}`, left, y);
      y += 22;

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#111827');
      doc.text('Proposta', left, y);
      y += 18;
      doc.fontSize(10).font('Helvetica').fillColor('#1f2937');
      doc.text(`Número: ${proposta.numero}`, left, y);
      y += 14;
      doc.text(`Título: ${proposta.titulo}`, left, y);
      y += 14;
      doc.text(`Data: ${formatPtDate(proposta.createdAt)}`, left, y);
      y += 14;
      doc.text(`Validade: ${formatPtDate(proposta.validade)}`, left, y);
      y += 22;

      const colWidths = [
        pageWidth * 0.38,
        pageWidth * 0.1,
        pageWidth * 0.16,
        pageWidth * 0.14,
        pageWidth * 0.22,
      ];
      const headers = [
        'Descrição',
        'Qtd',
        'Valor unit.',
        'Desc. %',
        'Total',
      ];
      const colX = colWidths.reduce<number[]>((acc, _w, i) => {
        acc.push(i === 0 ? left : acc[i - 1]! + colWidths[i - 1]!);
        return acc;
      }, []);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
      headers.forEach((header, index) => {
        doc.text(header, colX[index], y, {
          width: colWidths[index] - 4,
          lineBreak: false,
        });
      });
      y += 14;
      doc.moveTo(left, y).lineTo(left + pageWidth, y).strokeColor('#e5e7eb').stroke();
      y += 8;

      doc.font('Helvetica').fillColor('#111827');
      for (const item of proposta.itens) {
        const values = [
          item.descricao,
          String(item.quantidade),
          formatBrl(item.valorUnit),
          `${Number(item.desconto).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
          formatBrl(item.total),
        ];
        const rowHeight = Math.max(
          ...values.map((value, index) =>
            doc.heightOfString(value, { width: colWidths[index] - 4 }),
          ),
          12,
        );
        values.forEach((value, index) => {
          doc.text(value, colX[index], y, { width: colWidths[index] - 4 });
        });
        y += rowHeight + 6;
      }

      y += 10;
      doc.fontSize(10).font('Helvetica').fillColor('#1f2937');
      doc.text(`Subtotal: ${formatBrl(subtotal)}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 14;
      doc.text(
        `Desconto geral (${descontoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%): -${formatBrl(descontoValor)}`,
        left,
        y,
        { width: pageWidth, align: 'right' },
      );
      y += 16;
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827');
      doc.text(`Total final: ${formatBrl(proposta.total)}`, left, y, {
        width: pageWidth,
        align: 'right',
      });
      y += 28;

      if (proposta.observacoes?.trim()) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#374151');
        doc.text('Observações', left, y);
        y += 14;
        doc.fontSize(10).font('Helvetica').fillColor('#1f2937');
        doc.text(proposta.observacoes.trim(), left, y, { width: pageWidth });
        y += doc.heightOfString(proposta.observacoes.trim(), { width: pageWidth }) + 16;
      }

      const footerY = doc.page.height - doc.page.margins.bottom - 24;
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6b7280');
      const validadeLabel = proposta.validade
        ? formatPtDate(proposta.validade)
        : 'data a combinar';
      doc.text(`Proposta válida até ${validadeLabel}`, left, footerY, {
        width: pageWidth,
        align: 'center',
      });

      doc.end();
    });
  }
}
