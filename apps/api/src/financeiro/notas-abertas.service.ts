import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, OrderSource } from '@erp/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../quotes/mail.service';
import { R2StorageService } from '../storage/r2-storage.service';
import {
  mergeWegNotasAbertas,
  type CaTituloNfInput,
  type NotaAbertaRow,
  type WegNfConciliacaoInput,
  type WegOrderNfInput,
} from './notas-abertas';
import {
  parseWegPagamentosPlanilha,
  type WegPlanilhaPagamento,
} from './weg-nf-referencia';
import { parseInterCsv, type BankCredit } from './bank-credits';
import {
  CONCILIACAO_ORIGEM_EXTRATO_INTER,
  reconcileBankCredits,
  type BankReconcileResult,
  type ReconcileOpenNote,
} from './bank-reconcile';
import { InterIntegrationService } from './inter-integration.service';
import { invoiceNumberDigits } from '../orders/order-search';
import { formatDayMonthBr } from './cobranca-email';

export type WegImportPreviewMatch = {
  invoiceDigits: string;
  pedido: string;
  valor: number;
  pagoEm: string | null;
  docCompensacao: string | null;
  jaDeclarado: boolean;
  legado: boolean;
};

export type WegImportPreviewNotFound = {
  referencia: string;
  invoiceDigits: string;
  valor: number;
  pagoEm: string | null;
};

export type WegImportPreview = {
  totalLinhasComReferencia: number;
  matched: WegImportPreviewMatch[];
  notFound: WegImportPreviewNotFound[];
  skippedSemReferencia: number;
};

export type CobrancaPreview = {
  invoiceDigits: string[];
  pedido: string;
  customerName: string | null;
  emailSugerido: string | null;
  assunto: string;
  corpo: string;
  anexosDisponiveis: Array<{
    invoiceDigits: string;
    invoiceNumber: string;
    xml: boolean;
    danfe: boolean;
  }>;
};

export type EnviarCobrancaInput = {
  invoiceDigits: string[];
  to: string;
  assunto?: string;
  corpo?: string;
  userId: string;
};

@Injectable()
export class NotasAbertasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inter: InterIntegrationService,
    private readonly mail: MailService,
    @Optional() private readonly storage?: R2StorageService,
  ) {}

  async list(opts: { includeLegado?: boolean } = {}): Promise<{
    data: NotaAbertaRow[];
    meta: { total: number; legadoOcultos: number };
  }> {
    const [open, withLegado] = await Promise.all([
      this.loadRows({ includeLegado: Boolean(opts.includeLegado) }),
      opts.includeLegado
        ? Promise.resolve([] as NotaAbertaRow[])
        : this.loadRows({ includeLegado: true }),
    ]);
    const legadoOcultos = opts.includeLegado
      ? 0
      : withLegado.filter((r) => r.legado).length;
    return {
      data: open,
      meta: { total: open.length, legadoOcultos },
    };
  }

  async previewImport(buffer: Uint8Array): Promise<WegImportPreview> {
    const parsed = parseWegPagamentosPlanilha(buffer);
    return this.buildPreview(parsed);
  }

  async previewExtrato(buffer: Uint8Array): Promise<BankReconcileResult> {
    const credits = parseInterCsv(buffer);
    return this.reconcileFromCredits(credits);
  }

  async applyExtrato(
    buffer: Uint8Array,
    userId: string,
  ): Promise<{
    confirmed: number;
    alerts: number;
    wegSemNota: number;
    preview: BankReconcileResult;
  }> {
    const credits = parseInterCsv(buffer);
    return this.applyCredits(credits, userId);
  }

  /** Preview de conciliação via API Inter (mesmo motor do CSV). */
  async previewExtratoApi(
    dataInicio: Date,
    dataFim: Date,
  ): Promise<BankReconcileResult & { meta: { path: string; rawCount: number; credits: number } }> {
    const fetched = await this.inter.fetchExtratoCredits(dataInicio, dataFim);
    const preview = await this.reconcileFromCredits(fetched.credits);
    return {
      ...preview,
      meta: {
        path: fetched.path,
        rawCount: fetched.rawTransactionCount,
        credits: fetched.credits.length,
      },
    };
  }

  async applyExtratoApi(
    dataInicio: Date,
    dataFim: Date,
    userId: string | null,
  ): Promise<{
    confirmed: number;
    alerts: number;
    wegSemNota: number;
    preview: BankReconcileResult;
    meta: { path: string; rawCount: number; credits: number };
  }> {
    const fetched = await this.inter.fetchExtratoCredits(dataInicio, dataFim);
    const applied = await this.applyCredits(fetched.credits, userId);
    return {
      ...applied,
      meta: {
        path: fetched.path,
        rawCount: fetched.rawTransactionCount,
        credits: fetched.credits.length,
      },
    };
  }

  async previewCobranca(invoiceDigitsList: string[]): Promise<CobrancaPreview> {
    const digits = this.normalizeDigitsList(invoiceDigitsList);
    const rows = await this.requireRows(digits);
    const pedido = rows[0]!.pedido;
    if (rows.some((r) => r.pedido !== pedido)) {
      throw new BadRequestException(
        'Selecione notas do mesmo pedido/cliente para cobrança em lote.',
      );
    }
    const emailInfo = await this.resolveCustomerEmail(rows[0]!);
    const anexosDisponiveis = await this.listAnexos(digits);
    const venc = formatDayMonthBr(rows[0]!.vencimento);
    const nfs = rows.map((r) => r.invoiceNumber).join(', ');
    return {
      invoiceDigits: digits,
      pedido,
      customerName: emailInfo.customerName,
      emailSugerido: emailInfo.email,
      assunto: `Cobrança — NF(s) ${nfs} em aberto (pedido ${pedido})`,
      corpo: [
        `Prezado(a),`,
        ``,
        `Segue nota fiscal em aberto, vencimento ${venc}.`,
        ``,
        `Pedido: ${pedido}`,
        `Nota(s): ${nfs}`,
        `Valor total: R$ ${rows.reduce((s, r) => s + (r.valor || 0), 0).toFixed(2).replace('.', ',')}`,
        ``,
        `Atenciosamente,`,
        `Energy Brands`,
      ].join('\n'),
      anexosDisponiveis,
    };
  }

  async enviarCobranca(input: EnviarCobrancaInput): Promise<{
    messageId: string;
    enviadoPara: string;
    anexos: string[];
    envios: Array<{ id: string; invoiceDigits: string; enviadoEm: string }>;
  }> {
    const digits = this.normalizeDigitsList(input.invoiceDigits);
    if (!digits.length) {
      throw new BadRequestException('Informe ao menos uma nota.');
    }
    const to = String(input.to ?? '').trim();
    if (!to || !to.includes('@')) {
      throw new BadRequestException('E-mail do destinatário inválido.');
    }
    const preview = await this.previewCobranca(digits);
    const assunto = (input.assunto?.trim() || preview.assunto).slice(0, 200);
    const corpo = input.corpo?.trim() || preview.corpo;
    const attachments = await this.loadAttachments(digits);
    if (attachments.length === 0) {
      throw new BadRequestException(
        'Nenhum XML/DANFE encontrado no storage para as notas selecionadas.',
      );
    }

    const html = corpo
      .split('\n')
      .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
      .join('');

    const { messageId } = await this.mail.sendMail({
      to,
      subject: assunto,
      html,
      text: corpo,
      attachments,
    });

    const anexosLabel = attachments.map((a) => a.filename).join(', ');
    const envios: Array<{ id: string; invoiceDigits: string; enviadoEm: string }> =
      [];

    await this.prisma.client.$transaction(async (tx) => {
      for (const row of await this.requireRows(digits)) {
        const conc = await this.ensureConciliacao(tx, row);
        const created = await tx.wegNfCobrancaEnvio.create({
          data: {
            conciliacaoId: conc.id,
            invoiceDigits: row.invoiceDigits,
            enviadoPara: to,
            assunto,
            enviadoPorId: input.userId,
            anexos: anexosLabel,
            messageId: messageId || null,
          },
        });
        envios.push({
          id: created.id,
          invoiceDigits: created.invoiceDigits,
          enviadoEm: created.enviadoEm.toISOString(),
        });
      }
    });

    return { messageId, enviadoPara: to, anexos: attachments.map((a) => a.filename), envios };
  }

  async listCobrancas(invoiceDigits: string) {
    const digits = String(invoiceDigits ?? '').replace(/\D/g, '');
    if (!digits) throw new BadRequestException('NF inválida.');
    const rows = await this.prisma.client.wegNfCobrancaEnvio.findMany({
      where: { invoiceDigits: digits },
      orderBy: { enviadoEm: 'desc' },
      include: { enviadoPor: { select: { name: true, email: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      invoiceDigits: r.invoiceDigits,
      enviadoPara: r.enviadoPara,
      assunto: r.assunto,
      enviadoEm: r.enviadoEm.toISOString(),
      enviadoPor: r.enviadoPor?.name ?? r.enviadoPor?.email ?? null,
      anexos: r.anexos,
      messageId: r.messageId,
    }));
  }

  private async applyCredits(credits: BankCredit[], userId: string | null) {
    const preview = await this.reconcileFromCredits(credits);

    await this.prisma.client.$transaction(async (tx) => {
      for (const match of preview.autoMatches) {
        const bankDate = new Date(match.credit.date);
        for (const note of match.notes) {
          await tx.wegNfConciliacao.updateMany({
            where: {
              invoiceDigits: note.invoiceDigits,
              confirmadoRecebidoEm: null,
            },
            data: {
              confirmadoRecebidoEm: bankDate,
              confirmadoRecebidoPorId: userId || null,
              confirmadoRecebidoOrigem: CONCILIACAO_ORIGEM_EXTRATO_INTER,
              alertaBancoData: null,
              alertaBancoValor: null,
              alertaBancoNome: null,
              alertaBancoHistorico: null,
            },
          });
        }
      }
      for (const alert of preview.alerts) {
        const bankDate = new Date(alert.credit.date);
        for (const note of alert.notes) {
          await tx.wegNfConciliacao.updateMany({
            where: {
              invoiceDigits: note.invoiceDigits,
              confirmadoRecebidoEm: null,
            },
            data: {
              alertaBancoData: bankDate,
              alertaBancoValor: new Prisma.Decimal(alert.credit.amount.toFixed(2)),
              alertaBancoNome: alert.credit.counterparty,
              alertaBancoHistorico: alert.credit.historico,
            },
          });
        }
      }
    });

    return {
      confirmed: preview.autoMatches.reduce((s, m) => s + m.notes.length, 0),
      alerts: preview.alerts.reduce((s, a) => s + a.notes.length, 0),
      wegSemNota: preview.wegSemNota.length,
      preview,
    };
  }

  private async reconcileFromCredits(credits: BankCredit[]) {
    const rows = await this.loadRows({ includeLegado: true });
    const open: ReconcileOpenNote[] = rows
      .filter((r) => r.status === 'DECLARADO')
      .map((r) => ({
        invoiceDigits: r.invoiceDigits,
        pedido: r.pedido,
        valor: r.declaradoPagoValor ?? r.valor,
        pagoEm: r.declaradoPagoEm ? new Date(r.declaradoPagoEm) : null,
        docCompensacao: r.declaradoPagoDoc,
      }));
    return reconcileBankCredits(credits, open);
  }

  async applyImport(buffer: Uint8Array): Promise<{
    applied: number;
    notFound: number;
    preview: WegImportPreview;
  }> {
    const parsed = parseWegPagamentosPlanilha(buffer);
    if (parsed.length === 0) {
      throw new BadRequestException(
        'Nenhuma linha com Referência de NF encontrada na planilha.',
      );
    }
    const preview = await this.buildPreview(parsed);
    if (preview.matched.length === 0) {
      return { applied: 0, notFound: preview.notFound.length, preview };
    }

    const byDigits = new Map<string, WegPlanilhaPagamento>();
    for (const row of parsed) byDigits.set(row.invoiceDigits, row);

    const allRows = await this.loadRows({ includeLegado: true });
    const known = new Map(allRows.map((r) => [r.invoiceDigits, r]));

    await this.prisma.client.$transaction(async (tx) => {
      for (const match of preview.matched) {
        const sheet = byDigits.get(match.invoiceDigits);
        const knownRow = known.get(match.invoiceDigits);
        if (!sheet || !knownRow) continue;
        await tx.wegNfConciliacao.upsert({
          where: { invoiceDigits: match.invoiceDigits },
          create: {
            invoiceDigits: match.invoiceDigits,
            orderId: knownRow.orderId,
            contaAzulTituloId: knownRow.contaAzulTituloId,
            declaradoPagoEm: sheet.pagoEm,
            declaradoPagoValor: new Prisma.Decimal(sheet.valor.toFixed(2)),
            declaradoPagoDoc: sheet.docCompensacao,
          },
          update: {
            orderId: knownRow.orderId,
            contaAzulTituloId: knownRow.contaAzulTituloId,
            declaradoPagoEm: sheet.pagoEm,
            declaradoPagoValor: new Prisma.Decimal(sheet.valor.toFixed(2)),
            declaradoPagoDoc: sheet.docCompensacao,
          },
        });
      }
    });

    return {
      applied: preview.matched.length,
      notFound: preview.notFound.length,
      preview,
    };
  }

  async confirmarPago(invoiceDigits: string, userId: string) {
    const digits = String(invoiceDigits ?? '').replace(/\D/g, '');
    if (!digits) {
      throw new BadRequestException('Número da NF inválido.');
    }
    const all = await this.loadRows({ includeLegado: true });
    const row = all.find((r) => r.invoiceDigits === digits);
    if (!row) {
      throw new NotFoundException('Nota não encontrada na lista WEG.');
    }
    if (row.status === 'CONFIRMADO') {
      return row;
    }
    if (row.status !== 'DECLARADO') {
      throw new BadRequestException(
        'Só é possível confirmar pagamento depois de Declarado Pago pela planilha WEG.',
      );
    }

    const now = new Date();
    await this.prisma.client.wegNfConciliacao.upsert({
      where: { invoiceDigits: digits },
      create: {
        invoiceDigits: digits,
        orderId: row.orderId,
        contaAzulTituloId: row.contaAzulTituloId,
        declaradoPagoEm: row.declaradoPagoEm ? new Date(row.declaradoPagoEm) : now,
        declaradoPagoValor:
          row.declaradoPagoValor != null
            ? new Prisma.Decimal(row.declaradoPagoValor.toFixed(2))
            : null,
        confirmadoRecebidoEm: now,
        confirmadoRecebidoPorId: userId,
        confirmadoRecebidoOrigem: 'Manual',
      },
      update: {
        confirmadoRecebidoEm: now,
        confirmadoRecebidoPorId: userId,
        confirmadoRecebidoOrigem: 'Manual',
        alertaBancoData: null,
        alertaBancoValor: null,
        alertaBancoNome: null,
        alertaBancoHistorico: null,
      },
    });

    const refreshed = await this.loadRows({ includeLegado: true });
    const next = refreshed.find((r) => r.invoiceDigits === digits);
    if (!next) throw new NotFoundException('Nota não encontrada após confirmar.');
    return next;
  }

  private normalizeDigitsList(list: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of list ?? []) {
      const d = String(raw ?? '').replace(/\D/g, '');
      if (!d || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out;
  }

  private async requireRows(digits: string[]): Promise<NotaAbertaRow[]> {
    const all = await this.loadRows({ includeLegado: true });
    const by = new Map(all.map((r) => [r.invoiceDigits, r]));
    const rows: NotaAbertaRow[] = [];
    for (const d of digits) {
      const row = by.get(d);
      if (!row) {
        throw new NotFoundException(`Nota ${d} não encontrada.`);
      }
      rows.push(row);
    }
    return rows;
  }

  private async resolveCustomerEmail(row: NotaAbertaRow): Promise<{
    email: string | null;
    customerName: string | null;
  }> {
    if (!row.orderId) return { email: null, customerName: null };
    const order = await this.prisma.client.order.findUnique({
      where: { id: row.orderId },
      select: {
        customerName: true,
        customerDocument: true,
        customer: { select: { email: true, name: true, document: true } },
      },
    });
    if (!order) return { email: null, customerName: null };
    if (order.customer?.email?.trim()) {
      return {
        email: order.customer.email.trim(),
        customerName: order.customer.name || order.customerName,
      };
    }
    const doc = (order.customerDocument || order.customer?.document || '')
      .replace(/\D/g, '');
    if (doc) {
      const byDoc = await this.prisma.client.customer.findFirst({
        where: {
          OR: [
            { document: doc },
            { document: { contains: doc } },
          ],
        },
        select: { email: true, name: true },
      });
      if (byDoc?.email?.trim()) {
        return { email: byDoc.email.trim(), customerName: byDoc.name };
      }
    }
    return { email: null, customerName: order.customerName };
  }

  private async listAnexos(digits: string[]) {
    const rows = await this.prisma.client.orderInvoiceHistory.findMany({
      where: {
        OR: digits.map((d) => ({
          invoiceNumber: { contains: d },
        })),
      },
      select: {
        invoiceNumber: true,
        xmlStorageKey: true,
        danfeStorageKey: true,
      },
    });
    return digits.map((d) => {
      const match = rows.find(
        (r) => invoiceNumberDigits(r.invoiceNumber) === d,
      );
      return {
        invoiceDigits: d,
        invoiceNumber: match?.invoiceNumber ?? d,
        xml: Boolean(match?.xmlStorageKey?.trim()),
        danfe: Boolean(match?.danfeStorageKey?.trim()),
      };
    });
  }

  private async loadAttachments(digits: string[]) {
    if (!this.storage) {
      throw new BadRequestException('Storage R2 não configurado.');
    }
    const rows = await this.prisma.client.orderInvoiceHistory.findMany({
      where: {
        OR: digits.map((d) => ({
          invoiceNumber: { contains: d },
        })),
      },
      select: {
        invoiceNumber: true,
        xmlStorageKey: true,
        danfeStorageKey: true,
      },
    });
    const attachments: Array<{
      filename: string;
      content: Buffer;
      contentType?: string;
    }> = [];
    for (const d of digits) {
      const match = rows.find(
        (r) => invoiceNumberDigits(r.invoiceNumber) === d,
      );
      if (!match) continue;
      const nf = match.invoiceNumber.replace(/\D/g, '') || d;
      if (match.xmlStorageKey?.trim()) {
        const file = await this.storage.getObjectBuffer(match.xmlStorageKey);
        attachments.push({
          filename: `NF-${nf}.xml`,
          content: file.buffer,
          contentType: file.contentType || 'application/xml',
        });
      }
      if (match.danfeStorageKey?.trim()) {
        const file = await this.storage.getObjectBuffer(match.danfeStorageKey);
        attachments.push({
          filename: `DANFE-${nf}.pdf`,
          content: file.buffer,
          contentType: file.contentType || 'application/pdf',
        });
      }
    }
    return attachments;
  }

  private async ensureConciliacao(
    tx: Prisma.TransactionClient,
    row: NotaAbertaRow,
  ) {
    return tx.wegNfConciliacao.upsert({
      where: { invoiceDigits: row.invoiceDigits },
      create: {
        invoiceDigits: row.invoiceDigits,
        orderId: row.orderId,
        contaAzulTituloId: row.contaAzulTituloId,
      },
      update: {
        orderId: row.orderId ?? undefined,
        contaAzulTituloId: row.contaAzulTituloId ?? undefined,
      },
    });
  }

  private async buildPreview(
    parsed: WegPlanilhaPagamento[],
  ): Promise<WegImportPreview> {
    const all = await this.loadRows({ includeLegado: true });
    const known = new Map(all.map((r) => [r.invoiceDigits, r]));
    const matched: WegImportPreviewMatch[] = [];
    const notFound: WegImportPreviewNotFound[] = [];
    const seen = new Set<string>();
    for (const row of parsed) {
      if (seen.has(row.invoiceDigits)) {
        const existing = matched.find((m) => m.invoiceDigits === row.invoiceDigits);
        if (existing) {
          existing.valor = row.valor;
          existing.pagoEm = row.pagoEm?.toISOString() ?? existing.pagoEm;
          existing.docCompensacao = row.docCompensacao ?? existing.docCompensacao;
        }
        continue;
      }
      seen.add(row.invoiceDigits);
      const knownRow = known.get(row.invoiceDigits);
      if (!knownRow) {
        notFound.push({
          referencia: row.referencia,
          invoiceDigits: row.invoiceDigits,
          valor: row.valor,
          pagoEm: row.pagoEm?.toISOString() ?? null,
        });
        continue;
      }
      matched.push({
        invoiceDigits: row.invoiceDigits,
        pedido: knownRow.pedido,
        valor: row.valor,
        pagoEm: row.pagoEm?.toISOString() ?? null,
        docCompensacao: row.docCompensacao,
        jaDeclarado: Boolean(knownRow.declaradoPagoEm),
        legado: knownRow.legado,
      });
    }
    return {
      totalLinhasComReferencia: parsed.length,
      matched,
      notFound,
      skippedSemReferencia: 0,
    };
  }

  private async loadRows(opts: { includeLegado: boolean }) {
    const [orders, titulos, conciliacoes] = await Promise.all([
      this.prisma.client.order.findMany({
        where: { source: OrderSource.WEG_MERCADO_ELETRONICO },
        select: {
          id: true,
          code: true,
          externalOrderNumber: true,
          invoiceNumber: true,
          notaRemessa: true,
          invoicedAt: true,
          createdAt: true,
          customerName: true,
          invoiceHistory: {
            select: {
              invoiceNumber: true,
              invoiceValue: true,
              createdAt: true,
            },
          },
          exits: {
            select: {
              invoiceNumber: true,
              invoiceValue: true,
              exitDate: true,
            },
          },
        },
      }),
      this.prisma.client.contaAzulTitulo.findMany({
        where: { tipo: 'RECEBER' },
        select: {
          id: true,
          numero: true,
          descricao: true,
          contraParte: true,
          valor: true,
          competencia: true,
          vencimento: true,
        },
      }),
      this.prisma.client.wegNfConciliacao.findMany({
        select: {
          invoiceDigits: true,
          declaradoPagoEm: true,
          declaradoPagoValor: true,
          declaradoPagoDoc: true,
          confirmadoRecebidoEm: true,
          confirmadoRecebidoOrigem: true,
          alertaBancoData: true,
          alertaBancoValor: true,
          alertaBancoNome: true,
          alertaBancoHistorico: true,
          orderId: true,
          contaAzulTituloId: true,
          confirmadoRecebidoPor: { select: { name: true } },
          cobrancas: {
            orderBy: { enviadoEm: 'desc' },
            take: 5,
            select: {
              id: true,
              enviadoEm: true,
              enviadoPara: true,
              enviadoPor: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const orderInputs: WegOrderNfInput[] = orders;
    const tituloInputs: CaTituloNfInput[] = titulos;
    const reconInputs: WegNfConciliacaoInput[] = conciliacoes.map((c) => ({
      invoiceDigits: c.invoiceDigits,
      declaradoPagoEm: c.declaradoPagoEm,
      declaradoPagoValor: c.declaradoPagoValor,
      declaradoPagoDoc: c.declaradoPagoDoc,
      confirmadoRecebidoEm: c.confirmadoRecebidoEm,
      confirmadoRecebidoPorNome: c.confirmadoRecebidoPor?.name ?? null,
      confirmadoRecebidoOrigem: c.confirmadoRecebidoOrigem,
      alertaBancoData: c.alertaBancoData,
      alertaBancoValor: c.alertaBancoValor,
      alertaBancoNome: c.alertaBancoNome,
      alertaBancoHistorico: c.alertaBancoHistorico,
      orderId: c.orderId,
      contaAzulTituloId: c.contaAzulTituloId,
      cobrancas: c.cobrancas.map((e) => ({
        id: e.id,
        enviadoEm: e.enviadoEm.toISOString(),
        enviadoPara: e.enviadoPara,
        enviadoPor: e.enviadoPor?.name ?? null,
      })),
    }));

    return mergeWegNotasAbertas({
      orders: orderInputs,
      titulos: tituloInputs,
      conciliacoes: reconInputs,
      includeLegado: opts.includeLegado,
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
