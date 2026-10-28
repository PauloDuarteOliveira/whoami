import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { GameRecord, HistoryService, statsOf } from './history.service';

export type GamesState = 'idle' | 'loading' | 'ready' | 'error' | 'missing';

/**
 * Your finished games, loaded once and shared by Your account's tabs (Overview, History, Achievements),
 * so switching tabs doesn't ask the database again.
 */
@Injectable({ providedIn: 'root' })
export class MyGames {
    private readonly history = inject(HistoryService);

    readonly state = signal<GamesState>('idle');
    readonly games = signal<GameRecord[]>([]);
    readonly stats = computed(() => statsOf(this.games()));

    /** Loads your games (again, with `fresh`, e.g. after a game ends or "Try again"). */
    load(fresh = false): void {
        if (!fresh && (this.state() === 'loading' || this.state() === 'ready')) return;
        this.state.set('loading');
        this.history.myGames().subscribe({
            next: games => {
                this.games.set(games);
                this.state.set('ready');
            },
            // The view isn't there until migration 007 runs (PostgREST answers 404 / PGRST205).
            error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.error?.code === 'PGRST205' ? 'missing' : 'error'),
        });
    }

    /** Signed out or another account: start again next time. */
    reset(): void {
        this.games.set([]);
        this.state.set('idle');
    }
}
