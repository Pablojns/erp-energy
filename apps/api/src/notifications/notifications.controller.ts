import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
  Sse,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { MessageEvent } from '@nestjs/common/interfaces';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { NotificationsSseService } from './notifications-sse.service';
import { NotificationsService } from './notifications.service';

@Controller('api/notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly sse: NotificationsSseService,
  ) {}

  @Get('stream')
  @Sse()
  stream(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.sse.streamForUser(user.id);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    const count = await this.notifications.countUnread(user.id);
    return { count };
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(user.id, body.preferences);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListNotificationsQueryDto,
  ) {
    const hasPagination =
      query.page !== undefined ||
      query.pageSize !== undefined ||
      query.read !== undefined ||
      query.priority !== undefined;

    if (hasPagination) {
      return this.notifications.findPaginated(user.id, query);
    }

    return this.notifications.findAll(user.id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Delete()
  deleteAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.deleteAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.markRead(user.id, id);
  }

  @Delete(':id')
  deleteOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.deleteOne(user.id, id);
  }
}
