import { Component, Input, computed, signal } from '@angular/core';
import { GameRecord } from '../../core/history.service';
import { BadgeState, badgesFor } from '../../shared/badges';

@Component({
    selector: 'app-badge-grid',
    template: `
    <section class="badges" aria-labelledby="badges-title">
      <div class="head">
        <h3 id="badges-title">Badges</h3>
        <span class="count">{{ earnedCount() }} of {{ all().length }}</span>
        <div class="filter" role="group" aria-label="Show">
          @for (f of filters; track f.id) {
            <button type="button" [class.on]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }}</button>
          }
        </div>
      </div>
      <ul class="grid">
        @for (b of shown(); track b.id) {
          <li class="badge" [class.earned]="b.earned" [attr.aria-label]="label(b)">
            <span class="mark" aria-hidden="true">{{ b.glyph }}</span>
            <div class="text">
              <strong>{{ b.name }}</strong>
              <span class="how">{{ b.how }}</span>
              @if (b.earned) {
                <span class="state done">✓ Earned</span>
              } @else {
                <span class="bar" aria-hidden="true"><span [style.width.%]="(b.current / b.target) * 100"></span></span>
                <span class="state">{{ b.current }} / {{ b.target }}</span>
              }
            </div>
          </li>
        } @empty {
          <li class="empty">No badges here yet. Play a game to start earning them!</li>
        }
      </ul>
    </section>
  `,
    styles: `
    :host { display: block; min-width: 0; }
    .badges { display: flex; flex-direction: column; gap: 12px; }
    .head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .head h3 { margin: 0; font-size: 19px; }
    .count { font-size: 13px; color: var(--muted); }
    .filter { margin-left: auto; display: flex; gap: 4px; padding: 3px; border-radius: 12px; background: var(--surface-2); }
    .filter button { height: 30px; padding: 0 12px; border: none; border-radius: 9px; background: transparent; color: var(--text-2); font: 700 12px var(--font); cursor: pointer; }
    .filter button.on { background: var(--accent); color: var(--on-accent); }
    .filter button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

    .grid { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
    .badge { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 16px; background: var(--surface-2); border: 1px dashed var(--border-strong); min-width: 0; }
    .badge.earned { border: 1px solid var(--accent); background: var(--accent-tint); }
    .mark { width: 48px; height: 48px; flex: none; border-radius: 50%; display: grid; place-items: center; font-family: var(--font-display); font-size: 15px; background: var(--surface-3); color: var(--faint); border: 2px dashed var(--border-strong); }
    .earned .mark { background: var(--accent); color: var(--on-accent); border: 2px solid var(--accent-deep); }
    .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .text strong { font-size: 14px; }
    .badge:not(.earned) .text strong { color: var(--text-2); }
    .how { font-size: 12px; line-height: 1.4; color: var(--muted); }
    .bar { margin-top: 4px; height: 6px; border-radius: 3px; background: var(--surface-3); overflow: hidden; }
    .bar span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
    .state { font-size: 12px; font-weight: 700; color: var(--text-3); }
    .state.done { color: var(--accent-text); }
    .empty { grid-column: 1 / -1; color: var(--muted); }
  `,
})
export class BadgeGrid {
    @Input({ required: true }) set games(games: GameRecord[]) {
        this.all.set(badgesFor(games));
    }

    protected readonly all = signal<BadgeState[]>([]);
    protected readonly earnedCount = computed(() => this.all().filter(b => b.earned).length);
    protected readonly filters = [{ id: 'all', label: 'All' }, { id: 'earned', label: 'Earned' }, { id: 'locked', label: 'To unlock' }] as const;
    protected readonly filter = signal<'all' | 'earned' | 'locked'>('all');
    protected readonly shown = computed(() => {
        const f = this.filter();
        const list = this.all().filter(b => f === 'all' || (f === 'earned' ? b.earned : !b.earned));
        return [...list].sort((a, b) => Number(b.earned) - Number(a.earned) || b.current / b.target - a.current / a.target);
    });

    protected label(b: BadgeState): string {
        return `${b.name}: ${b.earned ? 'earned' : `locked, ${b.current} of ${b.target}`}. ${b.how}`;
    }
}
