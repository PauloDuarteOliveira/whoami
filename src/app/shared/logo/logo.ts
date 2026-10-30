import { Component, Input } from '@angular/core';

@Component({
    selector: 'app-logo',
    template: `
    <svg [attr.width]="size" [attr.height]="size" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 10 H46 Q60 10 60 24 V36 Q60 50 46 50 H30 L14 61 L18 49 Q4 47 4 34 V24 Q4 10 18 10 Z" fill="#B8861C" />
      <path d="M18 7 H46 Q60 7 60 21 V33 Q60 47 46 47 H30 L14 58 L18 46 Q4 44 4 31 V21 Q4 7 18 7 Z" fill="#FFC93C" />
      <text x="32" y="40" text-anchor="middle" font-family="'Titan One', system-ui, sans-serif" font-size="31" fill="#0A3440">?</text>
    </svg>
  `,
    styles: `:host { display: inline-flex; flex: none; line-height: 0; }`,
})
export class Logo {
    @Input() size = 30;
}
