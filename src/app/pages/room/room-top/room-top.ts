import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SkySwitch } from '../../../shared/sky-switch/sky-switch';

/**
 * The header of the Lobby and the Writing phase (design Layout A): the room on the left, the screen's
 * name in the middle, then the Night / Day switch and Leave room. Same look as the game's header.
 */
@Component({
    selector: 'app-room-top',
    imports: [SkySwitch],
    template: `
    <header class="top">
      <span class="logo" aria-hidden="true">?</span>
      <span class="brand">WhoAmI</span>
      <span class="code">{{ code }}</span>
      <span class="divider" aria-hidden="true"></span>
      <div class="info">
        <span class="title">{{ title }}</span>
        @if (subtitle) { <span class="subtitle">{{ subtitle }}</span> }
      </div>
      @if (connectionLost) { <span class="lost" role="status">Reconnecting…</span> }
      <app-sky-switch class="sky" [compact]="true" />
      <button type="button" class="btn btn-ghost leave" (click)="leave.emit()">Leave room</button>
    </header>
  `,
    styles: `
    :host { display: block; flex: none; }
    .top {
      min-height: 60px;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      background: var(--glass);
      backdrop-filter: blur(10px);
    }
    .logo { width: 30px; height: 30px; flex: none; border-radius: 9px; background: var(--accent); color: var(--on-accent); font-family: var(--font-display); display: grid; place-items: center; box-shadow: 0 3px 0 var(--accent-deep); }
    .brand { font-family: var(--font-display); font-size: 17px; }
    .code { padding: 3px 8px; border-radius: 8px; background: var(--surface-2); color: var(--text-2); font-size: 12px; font-weight: 700; letter-spacing: 1px; }
    .divider { width: 1px; height: 24px; background: var(--border); }
    .info { display: flex; align-items: baseline; gap: 10px; min-width: 0; white-space: nowrap; overflow: hidden; }
    .title { font-weight: 700; }
    .subtitle { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
    .lost { font-size: 12px; font-weight: 600; color: var(--no-text); white-space: nowrap; }
    .sky { margin-left: auto; }
    .leave { height: 38px; color: var(--no-text); white-space: nowrap; }

    @media (max-width: 1180px) {
      .top { padding: 10px 16px; gap: 10px; }
      .brand, .divider { display: none; }
    }
    @media (max-width: 760px) {
      .top { min-height: 56px; padding: 0 12px; gap: 8px; }
      .subtitle { display: none; }
      .leave { padding: 0 12px; }
    }
    @media (max-width: 420px) {
      .code { display: none; }
    }
  `,
})
export class RoomTop {
    @Input({ required: true }) code!: string;
    @Input({ required: true }) title!: string;
    @Input() subtitle = '';
    @Input() connectionLost = false;
    @Output() leave = new EventEmitter<void>();
}
