import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SerializedChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
};

export type SerializedChatRoom = {
  id: string;
  name: string | null;
  isGroup: boolean;
  displayName: string;
  otherUser: { id: string; name: string } | null;
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    userId: string;
    userName: string;
  } | null;
};

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDirectRoom(userId1: string, userId2: string) {
    if (userId1 === userId2) {
      throw new BadRequestException('Não é possível criar conversa consigo mesmo.');
    }

    const target = await this.prisma.client.user.findUnique({
      where: { id: userId2 },
      select: { id: true, isActive: true },
    });
    if (!target?.isActive) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const existing = await this.prisma.client.chatRoom.findFirst({
      where: {
        isGroup: false,
        AND: [
          { members: { some: { userId: userId1 } } },
          { members: { some: { userId: userId2 } } },
        ],
      },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    if (existing && existing.members.length === 2) {
      return this.serializeRoom(existing, userId1);
    }

    const created = await this.prisma.client.chatRoom.create({
      data: {
        isGroup: false,
        members: {
          create: [{ userId: userId1 }, { userId: userId2 }],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true } } } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    return this.serializeRoom(created, userId1);
  }

  async getRooms(userId: string): Promise<SerializedChatRoom[]> {
    const memberships = await this.prisma.client.chatMember.findMany({
      where: { userId },
      include: {
        room: {
          include: {
            members: { include: { user: { select: { id: true, name: true } } } },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    const rooms = memberships
      .map((m) => this.serializeRoom(m.room, userId))
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt ?? '';
        const bTime = b.lastMessage?.createdAt ?? '';
        return bTime.localeCompare(aTime);
      });

    return rooms;
  }

  async getMessages(
    roomId: string,
    userId: string,
  ): Promise<SerializedChatMessage[]> {
    await this.assertRoomMember(userId, roomId);

    const messages = await this.prisma.client.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    });

    return messages.reverse().map((m) => this.serializeMessage(m));
  }

  async getUsers(currentUserId: string) {
    return this.prisma.client.user.findMany({
      where: {
        isActive: true,
        id: { not: currentUserId },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }

  async createMessage(
    userId: string,
    roomId: string,
    content: string,
  ): Promise<SerializedChatMessage> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new BadRequestException('Mensagem vazia.');
    }

    await this.assertRoomMember(userId, roomId);

    const message = await this.prisma.client.chatMessage.create({
      data: {
        roomId,
        userId,
        content: trimmed,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    return this.serializeMessage(message);
  }

  private async assertRoomMember(userId: string, roomId: string) {
    const member = await this.prisma.client.chatMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!member) {
      throw new ForbiddenException('Você não participa desta conversa.');
    }
  }

  private serializeMessage(message: {
    id: string;
    roomId: string;
    userId: string;
    content: string;
    createdAt: Date;
    user: { id: string; name: string };
  }): SerializedChatMessage {
    return {
      id: message.id,
      roomId: message.roomId,
      userId: message.userId,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      user: message.user,
    };
  }

  private serializeRoom(
    room: {
      id: string;
      name: string | null;
      isGroup: boolean;
      members: Array<{ user: { id: string; name: string } }>;
      messages?: Array<{
        id: string;
        content: string;
        createdAt: Date;
        userId: string;
        user: { id: string; name: string };
      }>;
    },
    currentUserId: string,
  ): SerializedChatRoom {
    const other = room.members
      .map((m) => m.user)
      .find((u) => u.id !== currentUserId);
    const last = room.messages?.[0];

    return {
      id: room.id,
      name: room.name,
      isGroup: room.isGroup,
      displayName: room.isGroup
        ? room.name ?? 'Grupo'
        : (other?.name ?? 'Conversa'),
      otherUser: other ?? null,
      lastMessage: last
        ? {
            id: last.id,
            content: last.content,
            createdAt: last.createdAt.toISOString(),
            userId: last.userId,
            userName: last.user.name,
          }
        : null,
    };
  }
}
