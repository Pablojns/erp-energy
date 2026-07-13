import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsCron } from './notifications.cron';
import { NotificationsSseService } from './notifications-sse.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsCron, NotificationsSseService],
  exports: [NotificationsService, NotificationsSseService],
})
export class NotificationsModule {}
