import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Logger, UnauthorizedException } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

type AuthedSocket = Socket & { data: { user?: AuthUser } };

@WebSocketGateway({
  namespace: '/chat',
  cors: {
    origin: [
      'http://localhost:3000',
      'https://erp-energy.vercel.app',
      'https://erp-energy-web.vercel.app',
      'http://174.138.41.33:3000',
    ],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const user = await this.authenticate(client);
      client.data.user = user;
    } catch (error) {
      this.logger.warn(
        `Conexão WebSocket recusada: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(_client: AuthedSocket) {
    // noop
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() roomId: string,
  ) {
    const user = this.requireUser(client);
    if (!roomId?.trim()) return { ok: false };

    await this.chatService.getMessages(roomId, user.id);
    await client.join(roomId);
    return { ok: true, roomId };
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { roomId: string; content: string },
  ) {
    const user = this.requireUser(client);
    const message = await this.chatService.createMessage(
      user.id,
      payload.roomId,
      payload.content,
    );
    this.server.to(payload.roomId).emit('newMessage', message);
    return message;
  }

  private requireUser(client: AuthedSocket): AuthUser {
    if (!client.data.user) {
      throw new UnauthorizedException('Não autenticado.');
    }
    return client.data.user;
  }

  private async authenticate(client: AuthedSocket): Promise<AuthUser> {
    if (this.config.get<string>('AUTH_DISABLED') === 'true') {
      return this.resolveDevUser();
    }

    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers?.authorization as string | undefined);
    const token = raw?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Token ausente.');
    }

    const secret =
      this.config.get<string>('JWT_SECRET') ??
      'change-this-secret-in-production';
    const payload = this.jwtService.verify<JwtPayload>(token, { secret });

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Usuário inválido.');
    }

    const tokenVersion = payload.tokenVersion ?? 0;
    if (tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Token inválido.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }

  private async resolveDevUser(): Promise<AuthUser> {
    const user = await this.prisma.client.user.findFirst({
      where: {
        isActive: true,
        userRoles: { some: { role: { name: 'ADMIN' } } },
      },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('AUTH_DISABLED: sem usuário ADMIN.');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }
}
