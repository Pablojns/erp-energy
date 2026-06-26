import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { FinanceiroService } from './financeiro.service';

@Injectable()
export class FinanceiroCron {
  private readonly logger = new Logger(FinanceiroCron.name);

  constructor(
    private readonly financeiro: FinanceiroService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 6 * * *')
  async runDailySync(): Promise<void> {
    try {
      const { synced } = await this.financeiro.syncNFs();
      this.logger.log(`Financeiro: ${synced} NF(s) sincronizada(s).`);
      await this.notifyOverdueNfs();
    } catch (error) {
      this.logger.error(
        'Falha na sincronização financeira agendada',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notifyOverdueNfs(): Promise<void> {
    const overdue = await this.financeiro.listNfsAtrasadas();
    if (overdue.length === 0) {
      return;
    }

    const type = 'nf_financeira_atrasada';
    const link = 'financeiro:nfs-atrasadas';
    if (await this.notifications.hasRecentDuplicate(type, link)) {
      return;
    }

    await this.notifications.createForAdmins(
      'NFs financeiras atrasadas',
      `${overdue.length} nota(s) fiscal(is) com mais de 12 dias em aberto.`,
      type,
      link,
    );
  }
}
