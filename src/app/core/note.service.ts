import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Note } from './models';
import { SupabaseApiService } from './supabase-api.service';

@Injectable({ providedIn: 'root' })
export class NoteService {
  private readonly api = inject(SupabaseApiService);

  getNotes(roomId: string): Observable<Note[]> {
    return this.api.select<Note>('notes', { room_id: `eq.${roomId}` });
  }

  /** Each player has one note per room, so saving creates it the first time and updates it after. */
  save(roomId: string, playerId: string, text: string, visible: boolean): Observable<Note> {
    return this.api.upsert<Note>('notes', {
      player_id: playerId,
      room_id: roomId,
      text,
      visible,
      updated_at: new Date().toISOString(),
    });
  }
}
