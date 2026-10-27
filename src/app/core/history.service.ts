import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
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
    character_source: 'custom' | 'deck';
    started_at: string;
    ended_at: string;
    name: string;
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
    room: { code: string; status: 'lobby' | 'writing' | 'playing'; updated_at: string };
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

/** Signed-in players' finished games (Account → Your games). */
@Injectable({ providedIn: 'root' })
export class HistoryService {
    private readonly api = inject(SupabaseApiService);

    /** Your last 100 finished games, newest first. Row Level Security keeps it to your own. */
    myGames(): Observable<GameRecord[]> {
        return this.api.select<GameRecord>('my_games', { order: 'ended_at.desc', limit: '100' });
    }

    /**
     * Rooms you're still in (lobby, writing or playing) that moved in the last 12 hours, newest first:
     * Home's "Continue playing". Your account's players, so it works on any device you're signed in on.
     */
    openRooms(userId: string): Observable<OpenRoom[]> {
        const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
        return this.api.select<OpenRoom>('players', {
            // players → rooms through the player's room (rooms also points back at its current player).
            select: 'id,name,role,room:rooms!players_room_id_fkey!inner(code,status,updated_at)',
            user_id: `eq.${userId}`,
            status: 'not.in.(kicked,left)',
            'room.status': 'neq.finished',
            'room.updated_at': `gte.${since}`,
            order: 'joined_at.desc',
            limit: '3',
        });
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
