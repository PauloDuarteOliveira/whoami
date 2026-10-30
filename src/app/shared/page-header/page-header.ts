import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkySwitch } from '../sky-switch/sky-switch';
import { Logo } from '../logo/logo';
import { HomeLink } from '../home-link';
import { MeChip } from '../me-chip';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink, SkySwitch, Logo, HomeLink, MeChip],
  template: `
    <header class="bar">
      <a routerLink="/" class="back">← Back</a>
      <a appHomeLink class="logo"><app-logo /></a>
      <span class="title">{{ title }}</span>
      <span class="me"><app-me-chip /></span>
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
    .me { margin-left: auto; display: flex; flex: none; }
    .me:empty + .sky, .me:not(:has(a)) + .sky { margin-left: auto; }
    @media (max-width: 600px) { .bar { padding: 0 16px; } }
    @media (max-width: 380px) { .bar { gap: 8px; } .logo { margin-left: 2px; } }
  `,
})
export class PageHeader {
  @Input({ required: true }) title = '';
}