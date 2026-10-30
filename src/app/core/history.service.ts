import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { PlayerStatus } from './models';
import { SupabaseApiService } from './supabase-api.service';

export interface GameRival {
    name: string;
    avatar: string | null;
    color: string;
    status: PlayerStatus;
    finish_place: number | null;
    character: string | null;
}

export interface GameRecord {
    player_id: string;
    room_id: string;
    code: string;
    mode: 'voice' | 'novoice';
    character_source: 'custom' | 'deck' | 'list';
    started_at: string;
    ended_at: string;
    name: string;
    role: 'admin' | 'helper' | 'player';
    avatar: string | null;
    color: string;
    status: PlayerStatus;
    finish_place: number | null;
    finish_turn: number | null;
    character: string | null;
    questions_asked: number;
    guesses: number;
    others: GameRival[];
}

export interface OpenRoom {
    id: string;
    name: string;
    role: 'admin' | 'helper' | 'player' | 'spectator';
    room: { id: string; code: string; status: 'lobby' | 'writing' | 'playing' | 'finished'; updated_at: string };
}

export interface GameStats {
    played: number;
    guessed: number;
    guessedPct: number;
    wins: number;
    average: number | null;
    best: GameRecord | null;
}

export function resultStatus(p: { status: PlayerStatus; finish_place: number | null; finish_turn?: number | null }): PlayerStatus {
    if (p.status !== 'left') return p.status;
    if (p.finish_place !== null) return 'finished';
    return p.finish_turn !== null && p.finish_turn !== undefined ? 'gave_up' : 'left';
}

@Injectable({ providedIn: 'root' })
export class HistoryService {
    private readonly api = inject(SupabaseApiService);

    myGames(): Observable<GameRecord[]> {
        return this.api.select<GameRecord>('my_games', { order: 'ended_at.desc', limit: '100' }).pipe(
            map(games => games.map(g => ({
                ...g,
                status: resultStatus(g),
                others: (g.others ?? []).map(o => ({ ...o, status: resultStatus(o) })),
            }))),
        );
    }

    openRooms(userId: string): Observable<OpenRoom[]> {
        const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
        return this.api.select<OpenRoom>('players', {
            // players → rooms through the player's room (rooms also points back at its current player).
            select: 'id,name,role,room:rooms!players_room_id_fkey!inner(id,code,status,updated_at)',
            user_id: `eq.${userId}`,
            status: 'not.in.(kicked,left)',
            'room.updated_at': `gte.${since}`,
            order: 'joined_at.desc',
            limit: '6',
        }).pipe(
            switchMap(rooms => {
                const finished = rooms.filter(r => r.room.status === 'finished');
                if (!finished.length) return of(rooms.slice(0, 3));
                const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
                return this.api.select<{ room_id: string }>('players', {
                    select: 'room_id',
                    room_id: `in.(${finished.map(r => r.room.id).join(',')})`,
                    status: 'not.in.(kicked,left)',
                    last_seen: `gte.${recent}`,
                }).pipe(map(here => {
                    const alive = new Set(here.map(p => p.room_id));
                    return rooms.filter(r => r.room.status !== 'finished' || alive.has(r.room.id)).slice(0, 3);
                }));
            }),
        );
    }
}

export function statsOf(games: GameRecord[]): GameStats {
    const guessed = games.filter(g => g.status === 'finished');
    const best = guessed.reduce<GameRecord | null>((top, g) => (!top || g.questions_asked < top.questions_asked ? g : top), null);
    const total = guessed.reduce((sum, g) => sum + g.questions_asked, 0);
    return {
        played: games.length,
        guessed: guessed.length,
        guessedPct: games.length ? Math.round((guessed.length / games.length) * 100) : 0,
        wins: games.filter(g => g.finish_place === 1).length,
        average: guessed.length ? Math.round((total / guessed.length) * 10) / 10 : null,
        best,
    };
}
