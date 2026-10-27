import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
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

    join(roomId: string, name: string, role: PlayerRole, takenColors: string[] = [], avatar: string | null = null): Observable<Player> {
        const color = PLAYER_COLORS.find(c => !takenColors.includes(c)) ?? PLAYER_COLORS[takenColors.length % PLAYER_COLORS.length];
        const row = { room_id: roomId, name: name.trim(), role, color };
        if (!avatar) return this.api.insertOne<Player>('players', row);
        // Before migration 006 the avatar column doesn't exist (PGRST204): join without it.
        return this.api.insertOne<Player>('players', { ...row, avatar }).pipe(
            catchError((err: HttpErrorResponse) =>
                err.error?.code === 'PGRST204' ? this.api.insertOne<Player>('players', row) : throwError(() => err),
            ),
        );
    }

    /** You change your own animal (in the lobby). */
    setAvatar(playerId: string, avatar: string): Observable<Player> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { avatar }).pipe(map(rows => rows[0]));
    }

    heartbeat(playerId: string): Observable<unknown> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { last_seen: new Date().toISOString() });
    }

    setRole(playerId: string, role: PlayerRole): Observable<Player> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { role }).pipe(map(rows => rows[0]));
    }

    /** Mutes or unmutes a player in the chat (only the Admin and Helpers may, see migration 006). */
    setMuted(playerId: string, muted: boolean): Observable<Player> {
        return this.api.update<Player>('players', { id: `eq.${playerId}` }, { muted }).pipe(map(rows => rows[0]));
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