import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkySwitch } from '../sky-switch/sky-switch';
import { Logo } from '../logo/logo';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink, SkySwitch, Logo],
  template: `
    <header class="bar">
      <a routerLink="/" class="back">← Back</a>
      <app-logo class="logo" />
      <span class="title">{{ title }}</span>
      <app-sky-switch class="sky" />
    </header>
  `,
  styles: `
    .bar {
      height: 64px;
      padding: 0 40px;
      display: flex;
      align-items: center;
      gap: 10px;
      border-bottom: 1px solid var(--border);
    }
    .back { color: var(--text-2); text-decoration: none; font-weight: 600; white-space: nowrap; }
    .back:hover { color: var(--text); }
    .logo { margin-left: 16px; }
    .title { min-width: 0; font-weight: 800; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sky { margin-left: auto; }
    @media (max-width: 600px) { .bar { padding: 0 16px; } }
    /* Small phones: tighter, so "← Back" and the title stay on one line. */
    @media (max-width: 380px) { .bar { gap: 8px; } .logo { margin-left: 2px; } }
  `,
})
export class PageHeader {
  @Input({ required: true }) title = '';
}