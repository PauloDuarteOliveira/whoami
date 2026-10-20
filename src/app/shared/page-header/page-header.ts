import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Top bar for the screens before the game: Back link, logo and title. */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <header class="bar">
      <a routerLink="/" class="back">← Back</a>
      <span class="logo">?</span>
      <span class="title">{{ title }}</span>
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
    .logo {
      margin-left: 16px;
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: var(--accent);
      color: var(--bg);
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .title { font-weight: 800; font-size: 17px; }
    @media (max-width: 600px) { .bar { padding: 0 16px; } }
  `,
})
export class PageHeader {
  @Input({ required: true }) title = '';
}