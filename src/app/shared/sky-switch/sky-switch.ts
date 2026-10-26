import { Component, Input, inject } from '@angular/core';
import { PreferencesService } from '../../core/preferences.service';

/** The Night / Day switch shown in every screen's header. `compact` shows only the icons (a phone always does). */
@Component({
    selector: 'app-sky-switch',
    template: `
    <div class="sky-switch" [class.compact]="compact" role="group" aria-label="Day or night">
      <button type="button" [class.on]="prefs.sky() === 'night'" [attr.aria-pressed]="prefs.sky() === 'night'"
        aria-label="Night mode" (click)="prefs.setSky('night')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        @if (!compact) { <span class="label">Night</span> }
      </button>
      <button type="button" [class.on]="prefs.sky() === 'day'" [attr.aria-pressed]="prefs.sky() === 'day'"
        aria-label="Day mode" (click)="prefs.setSky('day')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        @if (!compact) { <span class="label">Day</span> }
      </button>
    </div>
  `,
    styles: `
    :host { flex: none; }
    .sky-switch { display: flex; gap: 2px; padding: 3px; border-radius: 12px; border: 1px solid var(--border-strong); }
    button {
      height: 32px; padding: 0 12px; border: none; border-radius: 9px; background: transparent;
      color: var(--text-2); font: 700 13px var(--font); display: flex; align-items: center; gap: 6px; cursor: pointer;
    }
    button:hover { color: var(--text); }
    button.on { background: var(--accent); color: var(--on-accent); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .compact button { width: 34px; padding: 0; justify-content: center; }
    /* Day: the sun sits behind the header, so the switch gets its own white surface and a dark
       active half; a yellow "on" would disappear into the yellow sun. */
    :host-context(html[data-sky="day"]) .sky-switch { background: #FFFFFF; box-shadow: 0 2px 10px rgba(11, 52, 64, 0.16); }
    :host-context(html[data-sky="day"]) button.on { background: #0B3440; color: #FFC93C; }
    /* On a phone the switch always shows only the icons. */
    @media (max-width: 600px) {
      button { width: 34px; padding: 0; justify-content: center; }
      .label { display: none; }
    }
  `,
})
export class SkySwitch {
    protected readonly prefs = inject(PreferencesService);
    @Input() compact = false;
}
