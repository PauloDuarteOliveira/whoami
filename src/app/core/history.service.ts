import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';
import { PlayerStatus } from './models';
import { SupabaseApiService } from './supabase-api.service';

/** Someone else in one of your games, and what they were. */
export interface GameRival {
    name: string;
    avatar: string | null;
    color: string;
    status: PlayerStatus;
    finish_place: number | null;
    character: string | null;
}

/** One finished game you played (a row of the my_games view, migration 007). */
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

/** A room you're still in: your player there, and the room. */
export interface OpenRoom {
    id: string;
    name: string;
    role: 'admin' | 'helper' | 'player' | 'spectator';
    room: { id: string; code: string; status: 'lobby' | 'writing' | 'playing' | 'finished'; updated_at: string };
}

/** Your numbers, worked out from your games. */
export interface GameStats {
    played: number;
    guessed: number;
    /** Share of games you guessed, 0–100. */
    guessedPct: number;
    /** Games you guessed first. */
    wins: number;
    /** Questions you needed, on average, in the games you guessed (null before the first guess). */
    average: number | null;
    /** Your best game: the fewest questions you guessed in. */
    best: GameRecord | null;
}

/**
 * How a player finished, even if they left the room afterwards ("Leave the room" on the results marks
 * them as left): a finish place means they guessed, a finish turn without one means they gave up.
 */
export function resultStatus(p: { status: PlayerStatus; finish_place: number | null; finish_turn?: number | null }): PlayerStatus {
    if (p.status !== 'left') return p.status;
    if (p.finish_place !== null) return 'finished';
    return p.finish_turn !== null && p.finish_turn !== undefined ? 'gave_up' : 'left';
}

/** Signed-in players' finished games (Account → Your games). */
@Injectable({ providedIn: 'root' })
export class HistoryService {
    private readonly api = inject(SupabaseApiService);

    /** Your last 100 finished games, newest first. Row Level Security keeps it to your own. */
    myGames(): Observable<GameRecord[]> {
        return this.api.select<GameRecord>('my_games', { order: 'ended_at.desc', limit: '100' }).pipe(
            map(games => games.map(g => ({
                ...g,
                status: resultStatus(g),
                others: (g.others ?? []).map(o => ({ ...o, status: resultStatus(o) })),
            }))),
        );
    }

    /**
     * Rooms you're still in that moved in the last 12 hours, newest first: Home's "Continue playing".
     * Lobby, writing or playing, and also a finished game whose room is still in use (the lobby after a game,
     * with someone there in the last 2 minutes). Your account's players, so it works on any device you're signed in on.
     */
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
                // A finished room counts only while someone is still in it (back in the lobby, waiting for Play again).
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
