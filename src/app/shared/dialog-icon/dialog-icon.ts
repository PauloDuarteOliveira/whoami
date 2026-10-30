import { Component, Input } from '@angular/core';

export type DialogIconName = 'kick' | 'skip' | 'crown' | 'flag' | 'vote' | 'pen' | 'warn';

@Component({
    selector: 'app-dialog-icon',
    template: `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name) {
        @case ('kick') { <path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /> }
        @case ('skip') { <path d="M5 5l9 7-9 7z" /><path d="M18 5v14" /> }
        @case ('crown') { <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" /> }
        @case ('flag') { <path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /> }
        @case ('vote') { <path d="M4 12l5 5L20 6" /> }
        @case ('pen') { <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /> }
        @case ('warn') { <path d="M12 3l10 18H2z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /> }
      }
    </svg>
  `,
    styles: `:host { display: inline-flex; }`,
})
export class DialogIcon {
    @Input({ required: true }) name!: DialogIconName;
}
