import { Component, inject } from '@angular/core';
import { SoundService } from '../core/sound.service';

@Component({
    selector: 'app-sound-toggle',
    template: `
    <button type="button" class="btn btn-ghost sound" [attr.aria-pressed]="!sound.on()"
      [attr.aria-label]="sound.on() ? 'Mute sounds' : 'Turn sounds on'" [title]="sound.on() ? 'Mute sounds' : 'Turn sounds on'"
      (click)="sound.toggle()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        @if (sound.on()) {
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        } @else {
          <path d="M16 9l5 6M21 9l-5 6" />
        }
      </svg>
    </button>
  `,
    styles: `
    :host { display: flex; flex: none; }
    .sound { width: 40px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center; }
    .sound[aria-pressed="true"] { color: var(--muted); }
    @media (max-width: 900px), (orientation: landscape) and (max-height: 500px) { .sound { height: 40px; } }
    @media (max-width: 380px) { .sound { width: 36px; } }
  `,
})
export class SoundToggle {
    protected readonly sound = inject(SoundService);
}
