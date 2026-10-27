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
