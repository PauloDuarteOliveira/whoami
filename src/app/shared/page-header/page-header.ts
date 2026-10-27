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
    .back { color: var(--text-2); text-decoration: none; font-weight: 600; }
    .back:hover { color: var(--text); }
    .logo { margin-left: 16px; }
    .title { font-weight: 800; font-size: 17px; }
    .sky { margin-left: auto; }
    @media (max-width: 600px) { .bar { padding: 0 16px; } }
  `,
})
export class PageHeader {
  @Input({ required: true }) title = '';
}