import { Component, Input } from '@angular/core';

/**
 * The WhoAmI logo: a yellow speech bubble with a "?", because the game is all about asking.
 * The same drawing is in public/favicon.svg and the README banners.
 */
@Component({
    selector: 'app-logo',
    template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 10 H46 Q60 10 60 24 V36 Q60 50 46 50 H30 L14 61 L18 49 Q4 47 4 34 V24 Q4 10 18 10 Z" fill="#B8861C" />
      <path d="M18 7 H46 Q60 7 60 21 V33 Q60 47 46 47 H30 L14 58 L18 46 Q4 44 4 31 V21 Q4 7 18 7 Z" fill="#FFC93C" />
      <path d="M24.5 20.5 Q24.5 13.5 32 13.5 Q39.5 13.5 39.5 20 Q39.5 24.5 35 26.5 Q32 28 32 31.5"
        fill="none" stroke="#0A3440" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="32" cy="38.5" r="3.6" fill="#0A3440" />
    </svg>
  `,
    styles: `:host { display: inline-flex; flex: none; line-height: 0; }`,
})
export class Logo {
    /** Width and height in pixels. */
    @Input() size = 30;
}
