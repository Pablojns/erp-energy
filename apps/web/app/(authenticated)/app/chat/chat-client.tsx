'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus, Send, X } from 'lucide-react';
import { io, type Socket } from 'socket.io-client';
import type { AuthUser } from '@/src/services/api/auth';
import { getChatSocketBaseUrl } from '@/src/services/api/config';
import { erpFetchJson } from '@/src/services/api/erp-fetch';
import { isAuthDisabled } from '@/src/services/auth/bypass';

type ChatRoom = {
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

type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
};

type ChatUser = {
  id: string;
  name: string;
  email: string;
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return date.toLocaleDateString('pt-BR');
}

export function ChatClient(props: {
  currentUser: AuthUser;
  wsToken: string;
}) {
  const { currentUser, wsToken } = props;
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRoomIdRef = useRef<string | null>(null);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loadingMessages]);

  const refreshRooms = useCallback(async () => {
    const data = await erpFetchJson<ChatRoom[]>('api/chat/rooms');
    setRooms(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingRooms(true);
    void refreshRooms()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar conversas.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRooms(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshRooms]);

  useEffect(() => {
    const socket = io(`${getChatSocketBaseUrl()}/chat`, {
      auth: isAuthDisabled() ? {} : { token: wsToken },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('newMessage', (message: ChatMessage) => {
      setRooms((prev) => {
        const next = prev.map((room) =>
          room.id === message.roomId
            ? {
                ...room,
                lastMessage: {
                  id: message.id,
                  content: message.content,
                  createdAt: message.createdAt,
                  userId: message.userId,
                  userName: message.user.name,
                },
              }
            : room,
        );
        return [...next].sort((a, b) => {
          const aTime = a.lastMessage?.createdAt ?? '';
          const bTime = b.lastMessage?.createdAt ?? '';
          return bTime.localeCompare(aTime);
        });
      });

      if (selectedRoomIdRef.current === message.roomId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [wsToken]);

  const selectRoom = async (room: ChatRoom) => {
    setSelectedRoomId(room.id);
    setLoadingMessages(true);
    setError(null);
    try {
      const data = await erpFetchJson<ChatMessage[]>(
        `api/chat/rooms/${room.id}/messages`,
      );
      setMessages(data);
      socketRef.current?.emit('joinRoom', room.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens.');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const openNewConversation = async () => {
    setUsersOpen(true);
    setUsersLoading(true);
    try {
      const data = await erpFetchJson<ChatUser[]>('api/chat/users');
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar usuários.');
    } finally {
      setUsersLoading(false);
    }
  };

  const startDirectChat = async (userId: string) => {
    setUsersOpen(false);
    setError(null);
    try {
      const room = await erpFetchJson<ChatRoom>(
        `api/chat/rooms/direct/${userId}`,
        { method: 'POST' },
      );
      setRooms((prev) => {
        const exists = prev.some((r) => r.id === room.id);
        const next = exists
          ? prev.map((r) => (r.id === room.id ? room : r))
          : [room, ...prev];
        return next;
      });
      await selectRoom(room);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao iniciar conversa.');
    }
  };

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || !selectedRoomId || sending) return;

    setSending(true);
    setInput('');
    setError(null);
    try {
      socketRef.current?.emit('sendMessage', {
        roomId: selectedRoomId,
        content: text,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="erp-module-card flex h-[calc(100dvh-7rem)] min-h-0 overflow-hidden">
      <aside className="flex w-full max-w-xs shrink-0 flex-col border-r border-[var(--erp-border)]">
        <div className="flex items-center justify-between border-b border-[var(--erp-border)] px-4 py-3">
          <h1 className="erp-text-sm font-semibold text-[var(--erp-fg)]">Chat</h1>
          <button
            type="button"
            onClick={() => void openNewConversation()}
            className="erp-focus-ring erp-btn erp-btn-secondary erp-btn--sm"
          >
            <MessageSquarePlus className="erp-icon-sm" />
            Nova conversa
          </button>
        </div>

        <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto">
          {loadingRooms ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rooms.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-500">
              Nenhuma conversa ainda. Inicie uma nova conversa.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {rooms.map((room) => {
                const active = room.id === selectedRoomId;
                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      onClick={() => void selectRoom(room)}
                      className={`w-full px-3 py-3 text-left transition ${
                        active ? 'bg-[var(--erp-accent-soft)]' : 'hover:bg-[var(--erp-bg-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {room.displayName}
                        </p>
                        {room.lastMessage ? (
                          <span className="shrink-0 text-[10px] text-gray-500">
                            {formatRelativeTime(room.lastMessage.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-gray-500">
                        {room.lastMessage?.content ?? 'Sem mensagens'}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {selectedRoom ? (
          <>
            <header className="shrink-0 border-b border-[var(--erp-border)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-accent-soft)] text-xs font-semibold text-[var(--erp-accent)]">
                  {initials(selectedRoom.displayName)}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    {selectedRoom.displayName}
                  </h2>
                  <p className="text-xs text-gray-500">Conversa interna</p>
                </div>
              </div>
            </header>

            <div className="erp-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loadingMessages ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-gray-500">
                  Nenhuma mensagem nesta conversa. Envie a primeira!
                </p>
              ) : (
                messages.map((message) => {
                  const isMine = message.userId === currentUser.id;
                  return (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {!isMine ? (
                        <span
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--erp-accent-soft)] text-[10px] font-semibold text-[var(--erp-accent)]"
                          title={message.user.name}
                        >
                          {initials(message.user.name)}
                        </span>
                      ) : null}
                      <div
                        className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}
                      >
                        {!isMine ? (
                          <span className="text-[10px] font-medium text-gray-500">
                            {message.user.name}
                          </span>
                        ) : null}
                        <div
                          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                            isMine
                              ? 'bg-[var(--accent)] text-[var(--color-text-inverse)]'
                              : 'border border-[var(--erp-border)] bg-[var(--erp-bg-muted)] text-[var(--erp-fg)]'
                          }`}
                        >
                          {message.content}
                        </div>
                        <span className="text-[10px] text-gray-500">
                          {formatRelativeTime(message.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(e) => void sendMessage(e)}
              className="shrink-0 border-t border-gray-200 p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder="Digite sua mensagem..."
                  disabled={sending}
                  className="erp-scrollbar max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="erp-focus-ring erp-btn erp-btn-primary erp-btn--md h-[42px] w-[42px] shrink-0 p-0 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Enviar mensagem"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <MessageSquarePlus className="h-10 w-10 text-gray-300" />
            <p className="text-sm text-gray-500">
              Selecione uma conversa ou inicie uma nova.
            </p>
          </div>
        )}

        {error ? (
          <p className="shrink-0 px-4 pb-2 text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {usersOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="erp-module-card flex max-h-[80vh] w-full max-w-md flex-col shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-900">Nova conversa</h3>
              <button
                type="button"
                onClick={() => setUsersOpen(false)}
                className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                </div>
              ) : users.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">
                  Nenhum usuário disponível.
                </p>
              ) : (
                <ul className="space-y-1">
                  {users.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        onClick={() => void startDirectChat(user.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-100"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--erp-accent-soft)] text-xs font-semibold text-[var(--erp-accent)]">
                          {initials(user.name)}
                        </span>
                        <span>
                          <span className="block text-sm font-medium text-gray-900">
                            {user.name}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {user.email}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
