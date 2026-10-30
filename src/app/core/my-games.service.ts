import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { GameRecord, HistoryService, statsOf } from './history.service';

export type GamesState = 'idle' | 'loading' | 'ready' | 'error' | 'missing';

@Injectable({ providedIn: 'root' })
export class MyGames {
    private readonly history = inject(HistoryService);

    readonly state = signal<GamesState>('idle');
    readonly games = signal<GameRecord[]>([]);
    readonly stats = computed(() => statsOf(this.games()));

    load(fresh = false): void {
        if (!fresh && (this.state() === 'loading' || this.state() === 'ready')) return;
        this.state.set('loading');
        this.history.myGames().subscribe({
            next: games => {
                this.games.set(games);
                this.state.set('ready');
            },
            error: (e: HttpErrorResponse) => this.state.set(e.status === 404 || e.error?.code === 'PGRST205' ? 'missing' : 'error'),
        });
    }

    reset(): void {
        this.games.set([]);
        this.state.set('idle');
    }
}
