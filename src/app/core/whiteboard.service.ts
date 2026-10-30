import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Whiteboard, WhiteboardInfo } from './models';
import { SupabaseApiService } from './supabase-api.service';

@Injectable({ providedIn: 'root' })
export class WhiteboardService {
  private readonly api = inject(SupabaseApiService);

  getInfo(roomId: string): Observable<WhiteboardInfo[]> {
    return this.api.select<WhiteboardInfo>('whiteboards', {
      select: 'player_id,room_id,shared,updated_at',
      room_id: `eq.${roomId}`,
    });
  }

  getBoard(playerId: string): Observable<Whiteboard | null> {
    return this.api.select<Whiteboard>('whiteboards', { player_id: `eq.${playerId}` }).pipe(map(rows => rows[0] ?? null));
  }

  save(roomId: string, playerId: string, image: string, shared: boolean): Observable<Whiteboard> {
    return this.api.upsert<Whiteboard>('whiteboards', {
      player_id: playerId,
      room_id: roomId,
      image,
      shared,
      updated_at: new Date().toISOString(),
    });
  }
}
