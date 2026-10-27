import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AVATARS, avatarLabel, avatarUrl } from './avatars';

/**
 * The 30 animals to choose from. The one you have is highlighted; animals other players in the room
 * already have are greyed out, so nobody looks the same.
 */
@Component({
    selector: 'app-avatar-picker',
    template: `
    <div class="grid" role="group" aria-label="Choose your avatar">
      @for (a of avatars; track a) {
        <button type="button" class="option" [class.on]="a === selected" [attr.aria-pressed]="a === selected"
          [disabled]="taken.includes(a) && a !== selected" [attr.aria-label]="label(a) + (taken.includes(a) && a !== selected ? ', taken' : '')"
          [title]="label(a)" (click)="pick.emit(a)">
          <img [src]="url(a)" alt="" draggable="false">
        </button>
      }
    </div>
  `,
    styles: `
    :host { display: block; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); gap: 8px; }
    .option {
      aspect-ratio: 1;
      padding: 7px;
      border-radius: 50%;
      border: 2px solid transparent;
      background: var(--surface-2);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: transform .08s;
    }
    .option img { width: 100%; height: 100%; pointer-events: none; }
    .option:hover:not(:disabled) { transform: scale(1.08); }
    .option.on { border-color: var(--accent); background: var(--accent-tint); }
    .option:disabled { opacity: .3; cursor: not-allowed; filter: grayscale(1); }
    .option:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `,
})
export class AvatarPicker {
    @Input() selected: string | null = null;
    /** Avatars other players in the room already have. */
    @Input() taken: (string | null)[] = [];
    @Output() pick = new EventEmitter<string>();

    protected readonly avatars = AVATARS;
    protected readonly url = avatarUrl;
    protected readonly label = avatarLabel;
}
