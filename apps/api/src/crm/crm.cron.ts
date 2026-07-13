import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NOTIFICATION_PRIORITY, NOTIFICATION_TYPES } from '../notifications/notification.constants';
import { isMorningDigestHour } from '../notifications/notification-time.util';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';

@Injectable()
export class CrmCron {
  private readonly logger = new Logger(CrmCron.name);

  constructor(
    private readonly crm: CrmService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 * * * *')
  async runDailyFollowUpNotifications(): Promise<void> {
    try {
      if (!isMorningDigestHour()) {
        return;
      }

      const config = await this.notifications.getConfig();
      const overdue = await this.crm.listFollowUpOverdueCards(
        config.leadFollowupDays,
      );
      let sent = 0;

      for (const card of overdue) {
        const type = NOTIFICATION_TYPES.CRM_FOLLOWUP;
        const link = `/app/crm`;

        await this.notifications.notifyRouted({
          type,
          title: 'CRM — Follow-up pendente',
          body: `O lead "${card.name}" está há mais de ${config.leadFollowupDays} dias sem touchpoint.`,
          link,
          entityId: card.id,
          entityType: 'crm_card',
          label: card.name,
          priority: NOTIFICATION_PRIORITY.NORMAL,
        });
        sent += 1;
      }

      if (sent > 0) {
        this.logger.log(`CRM: ${sent} notificação(ões) de follow-up enviada(s).`);
      }
    } catch (error) {
      this.logger.error(
        'Falha no cron de follow-up CRM',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
