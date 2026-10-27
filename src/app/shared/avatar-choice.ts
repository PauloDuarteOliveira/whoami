import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { AvatarPicker } from './avatar-picker';
import { avatarLabel, avatarUrl } from './avatars';

/**
 * Your animal next to your name (Home, Join): tap it to open the 30 animals underneath.
 * The host is display: contents, so it sits in its parent's grid: the button in the first column,
 * the picker across the whole row below (give the parent `grid-template-columns: auto 1fr`).
 */
@Component({
    selector: 'app-avatar-choice',
    imports: [AvatarPicker],
    template: `
    <button type="button" class="current" [attr.aria-expanded]="open()" [attr.aria-label]="'Your avatar: ' + label(selected) + '. Change it'"
      (click)="open.set(!open())">
      <img [src]="url(selected)" alt="" draggable="false">
      <span class="edit" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
      </span>
    </button>
    @if (open()) {
      <div class="panel">
        <span class="title">Pick your avatar</span>
        <app-avatar-picker [selected]="selected" [taken]="taken" (pick)="choose($event)" />
      </div>
    }
  `,
    styles: `
    :host { display: contents; }
    .current {
      grid-column: 1;
      grid-row: 1;
      position: relative;
      align-self: end;
      width: 64px;
      height: 64px;
      padding: 9px;
      border-radius: 50%;
      border: 2px solid var(--accent);
      background: var(--accent-tint);
      cursor: pointer;
      box-shadow: 0 4px 0 var(--accent-deep);
      transition: transform .08s, box-shadow .08s;
    }
    .current:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--accent-deep); }
    .current:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .current img { width: 100%; height: 100%; display: block; pointer-events: none; }
    .edit {
      position: absolute; right: -4px; bottom: -4px;
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--accent); color: var(--on-accent);
      display: grid; place-items: center;
      border: 2px solid var(--surface);
    }
    .panel { grid-column: 1 / -1; grid-row: 2; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: var(--bg); border: 1px solid var(--border); }
    .title { font-size: 13px; font-weight: 700; color: var(--text-2); }
  `,
})
export class AvatarChoice {
    @Input({ required: true }) selected!: string;
    /** Animals other players in the room already have (on the Join screen). */
    @Input() taken: (string | null)[] = [];
    @Output() pick = new EventEmitter<string>();

    protected readonly open = signal(false);
    protected readonly url = avatarUrl;
    protected readonly label = avatarLabel;

    protected choose(avatar: string): void {
        this.pick.emit(avatar);
        this.open.set(false);
    }
}
