import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NOTIFICATION_PRIORITY, NOTIFICATION_TYPES } from '../notifications/notification.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { CrmService } from './crm.service';

@Injectable()
export class CrmCron {
  private readonly logger = new Logger(CrmCron.name);

  constructor(
    private readonly crm: CrmService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *')
  async runDailyFollowUpNotifications(): Promise<void> {
    try {
      const overdue = await this.crm.listFollowUpOverdueCards();
      let sent = 0;

      for (const card of overdue) {
        if (!card.responsavelId) continue;

        const type = NOTIFICATION_TYPES.CRM_FOLLOWUP;
        const link = `/app/crm`;
        if (
          await this.notifications.hasUnreadDuplicate(type, card.id)
        ) {
          continue;
        }

        await this.notifications.create(
          card.responsavelId,
          'CRM — Follow-up pendente',
          `O lead "${card.name}" está há mais de 3 dias sem touchpoint.`,
          type,
          link,
          {
            entityId: card.id,
            entityType: 'crm_card',
            priority: NOTIFICATION_PRIORITY.NORMAL,
          },
        );
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
