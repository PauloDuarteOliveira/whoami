import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { GameRecord, GameRival, HistoryService, statsOf } from '../../core/history.service';
import { avatarUrl, isAvatar } from '../../shared/avatars';

type LoadState = 'loading' | 'ready' | 'error' | 'missing';

/**
 * Account → Your games: your numbers (games, guessed, average questions, best game) and every finished game.
 * Open a game to see who was who. Only for signed-in players: guests have no lasting account to keep it in.
 */
@Component({
    selector: 'app-game-history',
    imports: [DatePipe, RouterLink],
    template: `
    <section class="history card" aria-labelledby="history-title">
      <div class="head">
        <h2 id="history-title">Your games</h2>
        @if (state() === 'ready' && games().length) { <span class="count">{{ games().length }} finished</span> }
      </div>

      @switch (state()) {
        @case ('loading') { <p class="muted">Loading your games…</p> }
        @case ('missing') { <p class="muted">Game history isn't switched on yet.</p> }
        @case ('error') {
          <p class="muted">Couldn't load your games. <button type="button" class="link" (click)="load()">Try again</button></p>
        }
        @case ('ready') {
          @if (!games().length) {
            <p class="muted">No finished games yet. Play one to the end and it shows up here.</p>
            <a routerLink="/" class="btn btn-primary play">Play a game</a>
          } @else {
            <div class="tiles">
              <div class="tile"><span class="label">GAMES</span><span class="value">{{ stats().played }}</span><span class="sub">finished</span></div>
              <div class="tile"><span class="label">GUESSED</span><span class="value">{{ stats().guessed }}</span><span class="sub">{{ stats().guessedPct }}% of games</span></div>
              <div class="tile"><span class="label">AVERAGE</span><span class="value">{{ stats().average ?? '–' }}</span><span class="sub">questions to guess</span></div>
              <div class="tile"><span class="label">BEST GAME</span>
                @if (stats().best; as best) {
                  <span class="value">{{ best.questions_asked }}</span><span class="sub">{{ best.character ?? 'a guess' }}</span>
                } @else {
                  <span class="value">–</span><span class="sub">no guess yet</span>
                }
              </div>
            </div>
            @if (stats().wins) {
              <p class="wins">★ You guessed first in {{ stats().wins }} {{ stats().wins === 1 ? 'game' : 'games' }}.</p>
            }

            <ul class="games">
              @for (g of shown(); track g.player_id) {
                <li class="game" [class.open]="openId() === g.player_id">
                  <button type="button" class="row" [attr.aria-expanded]="openId() === g.player_id" (click)="toggle(g)">
                    <span class="when">{{ g.ended_at | date: 'd MMM, HH:mm' }}</span>
                    <span class="faces" aria-hidden="true">
                      @for (o of g.others.slice(0, 4); track $index) {
                        <span class="face" [style.background]="o.color">
                          @if (picture(o); as src) { <img [src]="src" alt=""> } @else { {{ o.name.charAt(0) }} }
                        </span>
                      }
                    </span>
                    <span class="was"><span class="small">You were</span><strong>{{ g.character ?? '—' }}</strong></span>
                    <span class="chip" [class]="'chip ' + resultKind(g)">{{ resultText(g) }}</span>
                  </button>
                  @if (openId() === g.player_id) {
                    <div class="detail">
                      <p class="small">
                        Room {{ g.code }} · {{ g.mode === 'voice' ? 'Voice' : 'No-Voice' }} ·
                        {{ g.character_source === 'custom' ? 'Custom Pool' : 'Pre-made deck' }} ·
                        you asked {{ g.questions_asked }} {{ g.questions_asked === 1 ? 'question' : 'questions' }}
                        and made {{ g.guesses }} {{ g.guesses === 1 ? 'guess' : 'guesses' }}
                      </p>
                      <ul class="others">
                        @for (o of g.others; track $index) {
                          <li>
                            <span class="face" [style.background]="o.color" aria-hidden="true">
                              @if (picture(o); as src) { <img [src]="src" alt=""> } @else { {{ o.name.charAt(0) }} }
                            </span>
                            <span class="who"><strong>{{ o.name }}</strong><span class="small">was {{ o.character ?? '—' }}</span></span>
                            <span class="chip" [class]="'chip ' + rivalKind(o)">{{ rivalText(o) }}</span>
                          </li>
                        }
                      </ul>
                    </div>
                  }
                </li>
              }
            </ul>
            @if (games().length > shown().length) {
              <button type="button" class="btn btn-ghost more" (click)="showAll.set(true)">Show all {{ games().length }} games</button>
            }
          }
        }
      }
    </section>
  `,
    styles: `
    :host { display: block; min-width: 0; }
    .history { display: flex; flex-direction: column; gap: 14px; padding: 24px; border-radius: 24px; }
    .head { display: flex; align-items: baseline; gap: 10px; }
    .head h2 { margin: 0; font-size: 22px; }
    .count { margin-left: auto; font-size: 13px; color: var(--muted); }
    .muted { margin: 0; color: var(--text-2); }
    .small { font-size: 12px; color: var(--muted); }
    .link { border: none; background: none; padding: 0; color: var(--accent-text); font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
    .play { align-self: flex-start; }

    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
    .tile { min-width: 0; padding: 14px 16px; border-radius: 18px; background: var(--surface-2); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
    .tile .label { font-size: 11px; font-weight: 700; letter-spacing: .6px; color: var(--muted); }
    .tile .value { font-family: var(--font-display); font-size: 32px; line-height: 1.1; }
    .tile .sub { font-size: 12px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wins { margin: 0; font-weight: 700; color: var(--accent-text); }

    .games { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .game { border-radius: 16px; background: var(--surface-2); border: 1px solid var(--border); overflow: hidden; }
    .game.open { border-color: var(--accent); }
    .row { width: 100%; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: none; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    .row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: 16px; }
    .when { width: 96px; flex: none; font-size: 12px; color: var(--muted); }
    .faces { display: flex; flex: none; }
    .faces .face + .face { margin-left: -8px; }
    .face { width: 28px; height: 28px; flex: none; border-radius: 50%; border: 2px solid var(--surface); display: grid; place-items: center; color: var(--on-accent); font-weight: 800; font-size: 12px; }
    .face img { width: 78%; height: 78%; display: block; }
    .was { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .was strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chip { flex: none; padding: 4px 10px; border-radius: 10px; font-weight: 800; font-size: 12px; white-space: nowrap; }
    .chip.best { background: var(--accent-soft); color: var(--accent-text); }
    .chip.yes { background: var(--yes-soft); color: var(--yes-text); }
    .chip.no { background: var(--no-soft); color: var(--no-text); }
    .chip.plain { background: var(--surface-3); color: var(--text-2); }

    .detail { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; }
    .detail .small { margin: 0; }
    .others { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .others li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; background: var(--surface); min-width: 0; }
    .who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .who .small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .more { align-self: center; }

    @media (max-width: 700px) {
      .history { padding: 18px; }
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      /* A row keeps "You were …" and the result; the faces are in the opened game. */
      .when, .row .faces { display: none; }
      .others { grid-template-columns: 1fr; }
    }
  `,
})
export class GameHistory implements OnInit {
    private readonly history = inject(HistoryService);

    protected readonly state = signal<LoadState>('loading');
    protected readonly games = signal<GameRecord[]>([]);
    protected readonly stats = computed(() => statsOf(this.games()));
    protected readonly showAll = signal(false);
    protected readonly shown = computed(() => (this.showAll() ? this.games() : this.games().slice(0, 5)));
    protected readonly openId = signal<string | null>(null);

    ngOnInit(): void {
        this.load();
    }

    protected load(): void {
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

    protected toggle(game: GameRecord): void {
        this.openId.set(this.openId() === game.player_id ? null : game.player_id);
    }

    protected picture(p: { avatar: string | null }): string | null {
        return isAvatar(p.avatar) ? avatarUrl(p.avatar) : null;
    }

    protected resultKind(g: GameRecord): string {
        if (g.status === 'finished') return g.finish_place === 1 ? 'best' : 'yes';
        return g.status === 'gave_up' ? 'no' : 'plain';
    }

    protected resultText(g: GameRecord): string {
        if (g.status === 'finished') {
            const n = `${g.questions_asked} ${g.questions_asked === 1 ? 'question' : 'questions'}`;
            return g.finish_place === 1 ? `★ Guessed first · ${n}` : `Guessed in ${n}`;
        }
        return g.status === 'gave_up' ? 'Gave up' : "Didn't guess";
    }

    protected rivalKind(o: GameRival): string {
        if (o.status === 'finished') return o.finish_place === 1 ? 'best' : 'yes';
        return o.status === 'gave_up' ? 'no' : 'plain';
    }

    protected rivalText(o: GameRival): string {
        if (o.status === 'finished') return o.finish_place === 1 ? '★ 1st' : `${o.finish_place}${ordinal(o.finish_place ?? 0)}`;
        return o.status === 'gave_up' ? 'Gave up' : "Didn't guess";
    }
}

function ordinal(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) return 'th';
    return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}
