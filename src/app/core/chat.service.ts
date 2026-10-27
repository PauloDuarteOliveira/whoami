import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ChatMessage } from './models';
import { SupabaseApiService } from './supabase-api.service';

/** How many messages a room shows: the most recent ones. */
export const CHAT_LIMIT = 100;
export const CHAT_MAX_LENGTH = 300;

/** The room chat (see supabase/migrations/006). */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(SupabaseApiService);

  /** The last 100 messages, oldest first. An empty list if something fails, so the room still loads. */
  getRecent(roomId: string): Observable<ChatMessage[]> {
    return this.api
      .select<ChatMessage>('messages', { room_id: `eq.${roomId}`, order: 'created_at.desc', limit: String(CHAT_LIMIT) })
      .pipe(
        map(rows => rows.reverse()),
        catchError(() => of([])),
      );
  }

  send(roomId: string, playerId: string, text: string): Observable<ChatMessage> {
    return this.api.insertOne<ChatMessage>('messages', { room_id: roomId, player_id: playerId, text: text.trim() });
  }
}
