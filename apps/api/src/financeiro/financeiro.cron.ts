import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPES,
} from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';
import {
  diasAtrasoFromDue,
  dueDateFromEmissao,
  NF_PRAZO_DIAS,
  tituloCompletouXDiasAtraso,
} from './contas-atraso';
import { ContaAzulIntegrationService } from './conta-azul-integration.service';
import { FinanceiroService } from './financeiro.service';

@Injectable()
export class FinanceiroCron {
  private readonly logger = new Logger(FinanceiroCron.name);

  constructor(
    private readonly financeiro: FinanceiroService,
    private readonly notifications: NotificationsService,
    private readonly contaAzul: ContaAzulIntegrationService,
  ) {}

  /** A cada 20 min: NF da venda vinculada + XML/DANFE quando a SEFAZ já processou. */
  @Cron('*/20 * * * *')
  async pullNotaArquivos(): Promise<void> {
    try {
      const invoices = await this.contaAzul.syncLinkedVendaInvoices({
        apply: true,
      });
      if (invoices.filled > 0) {
        this.logger.log(
          `Conta Azul P1 NF: ${invoices.filled} Nota(s) de Venda preenchida(s) a partir da venda vinculada (${invoices.toFill} previstas, ${invoices.divergencias} divergência(s)).`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Conta Azul P1 NF automático ignorado: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      const result = await this.contaAzul.syncPendingNotaArquivos();
      if (result.saved > 0) {
        this.logger.log(
          `Conta Azul XML/Nota: ${result.saved} arquivo(s) vinculado(s) automaticamente (${result.scanned} vistos, ${result.skipped} ainda indisponíveis).`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Conta Azul XML/Nota automático ignorado: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron('0 6 * * *')
  async runDailySync(): Promise<void> {
    try {
      const { synced } = await this.financeiro.syncNFs();
      this.logger.log(`Financeiro: ${synced} NF(s) sincronizada(s).`);
      try {
        const ca = await this.contaAzul.syncAll();
        this.logger.log(
          `Conta Azul: ${ca.receber} receber, ${ca.pagar} pagar, ${ca.nfs} NF(s).`,
        );
      } catch (caErr) {
        this.logger.warn(
          `Conta Azul sync diário ignorado: ${caErr instanceof Error ? caErr.message : String(caErr)}`,
        );
      }
      await this.notifyOverdueReceivables();
      await this.notifyFinalizeStockGaps();
    } catch (error) {
      this.logger.error(
        'Falha na sincronização financeira agendada',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyOverdueReceivables(): Promise<void> {
    const config = await this.notifications.getConfig();
    const threshold = config.receivableOverdueDays;
    const overdue = await this.financeiro.listNfsAtrasadas();
    const now = new Date();

    for (const nf of overdue) {
      const due = dueDateFromEmissao(nf.dataEmissao, NF_PRAZO_DIAS);
      const dias = diasAtrasoFromDue(due, now);
      if (!tituloCompletouXDiasAtraso(dias, threshold)) continue;

      const pedido = nf.order.externalOrderNumber ?? nf.order.code;
      const label = `NF ${nf.invoiceNumber}`;
      await this.notifications.notifyRouted({
        type: NOTIFICATION_TYPES.RECEIVABLE_OVERDUE,
        title: 'Título em atraso',
        body: `${label} (pedido ${pedido}) completou ${dias} dia(s) de atraso.`,
        link: '/app/financeiro',
        entityId: nf.id,
        entityType: 'financeiro_nf',
        label,
        priority: NOTIFICATION_PRIORITY.HIGH,
        skipBusinessHours: true,
      });
    }
  }

  private async notifyFinalizeStockGaps(): Promise<void> {
    const { gaps, total } = await this.financeiro.listFinalizeStockGaps(30);
    if (total === 0) return;

    const type = NOTIFICATION_TYPES.STOCK_EXIT_GAP;
    const link = '/app/financeiro';
    if (await this.notifications.hasRecentDuplicate(type, link)) {
      return;
    }

    const sample = gaps
      .slice(0, 8)
      .map((g) => `${g.pedido}${g.invoiceNumber ? ` / NF ${g.invoiceNumber}` : ''}`)
      .join('; ');
    const extra = total > 8 ? ` (+${total - 8} outros)` : '';

    await this.notifications.createForAdmins(
      'Divergência de estoque em pedidos finalizados',
      `${total} pedido(s) FINALIZADO sem baixa de estoque correspondente: ${sample}${extra}.`,
      type,
      link,
    );
  }
}
