import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ChatMessage } from './models';
import { SupabaseApiService } from './supabase-api.service';

export const CHAT_LIMIT = 100;
export const CHAT_MAX_LENGTH = 300;

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly api = inject(SupabaseApiService);

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
