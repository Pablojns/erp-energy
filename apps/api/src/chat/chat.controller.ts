import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { RequirePermission } from '../common/permissions/require-permission.decorator';
import { ChatService } from './chat.service';

@Controller('api/chat')
@UseGuards(JwtGuard)
@RequirePermission('chat', 'ver_modulo')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  getRooms(@CurrentUser() user: AuthUser) {
    return this.chat.getRooms(user.id);
  }

  @Get('rooms/:roomId/messages')
  getMessages(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.getMessages(roomId, user.id);
  }

  @Get('users')
  getUsers(@CurrentUser() user: AuthUser) {
    return this.chat.getUsers(user.id);
  }

  @Post('rooms/direct/:userId')
  @RequirePermission('chat', 'criar')
  createDirectRoom(
    @Param('userId', ParseUUIDPipe) otherUserId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.chat.getOrCreateDirectRoom(user.id, otherUserId);
  }
}
