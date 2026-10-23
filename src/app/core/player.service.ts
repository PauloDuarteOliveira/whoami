import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Player, PlayerRole } from './models';
import { SupabaseApiService } from './supabase-api.service';

export const PLAYER_COLORS = [
    '#FFC93C', '#FF6B6B', '#7FB2FF', '#5CF2C2', '#C79BFF',
    '#F472B6', '#38BDF8', '#FACC15', '#FB923C', '#34D399',
];

export const ONLINE_WINDOW_MS = 30_000;

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

    heartbeat(playerId: string): Observable<unknown> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { last_seen: new Date().toISOString() });
    }

    setRole(playerId: string, role: PlayerRole): Observable<Player> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { role }).pipe(map(rows => rows[0]));
    }

    kick(playerId: string): Observable<unknown> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { status: 'kicked' });
    }

    leave(player: Player, inLobby: boolean): Observable<unknown> {
        return inLobby
            ? this.api.delete('players', { id: `eq.${player.id}` })
            : this.api.update<Player>('players', { id: `eq.${player.id}` }, {
                status: 'left',
                role: player.role === 'admin' ? 'player' : player.role,
            });
    }

    isOnline(player: Player, now = Date.now()): boolean {
        return now - new Date(player.last_seen).getTime() < ONLINE_WINDOW_MS;
    }
}