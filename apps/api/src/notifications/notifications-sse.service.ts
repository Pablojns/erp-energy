import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common/interfaces';
import { Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export type NotificationSsePayload = {
  userId: string;
  event: 'notification' | 'unread_count';
  data: Record<string, unknown>;
};

@Injectable()
export class NotificationsSseService implements OnModuleDestroy {
  private readonly subject = new Subject<NotificationSsePayload>();

  emit(payload: NotificationSsePayload): void {
    this.subject.next(payload);
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    return this.subject.pipe(
      filter((event) => event.userId === userId),
      map(
        (event) =>
          ({
            type: event.event,
            data: JSON.stringify(event.data),
          }) satisfies MessageEvent,
      ),
    );
  }

  onModuleDestroy(): void {
    this.subject.complete();
  }
}
