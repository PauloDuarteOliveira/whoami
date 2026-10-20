import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Player, PlayerRole } from './models';
import { SupabaseApiService } from './supabase-api.service';


export const PLAYER_COLORS = [
  '#F5A524', '#E7795A', '#6C8CFF', '#4FD1A1', '#A78BFA',
  '#F472B6', '#38BDF8', '#FACC15', '#FB923C', '#34D399',
];

@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly api = inject(SupabaseApiService);

  getPlayers(roomId: string): Observable<Player[]> {
    return this.api.select<Player>('players', { room_id: `eq.${roomId}`, order: 'joined_at.asc' });
  }

  join(roomId: string, name: string, role: PlayerRole, takenColors: string[] = []): Observable<Player> {
    const color = PLAYER_COLORS.find(c => !takenColors.includes(c)) ?? PLAYER_COLORS[takenColors.length % PLAYER_COLORS.length];
    return this.api.insertOne<Player>('players', { room_id: roomId, name: name.trim(), role, color });
  }
}