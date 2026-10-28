import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ProfileService } from '../core/profile.service';
import { avatarLabel, avatarUrl } from './avatars';

/**
 * Signed in: your animal and your name in the header, linking to Your account.
 * (Your email never shows here.) Guests see nothing, or the page's own "Sign in".
 */
@Component({
    selector: 'app-me-chip',
    imports: [RouterLink],
    template: `
    @if (!auth.isAnonymous()) {
      <a routerLink="/account" class="me" [attr.aria-label]="'Your account: ' + (profile.name() || 'you')">
        <span class="face" aria-hidden="true"><img [src]="picture()" alt=""></span>
        <span class="name">{{ profile.name() || 'Account' }}</span>
      </a>
    }
  `,
    styles: `
    :host { display: contents; }
    .me { flex: none; height: 40px; max-width: 200px; padding: 0 12px 0 4px; border-radius: 22px; border: 1px solid var(--border-strong); display: flex; align-items: center; gap: 8px; text-decoration: none; color: var(--text); font-weight: 700; font-size: 14px; }
    .me:hover { border-color: var(--accent); color: var(--text); }
    .me:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .face { width: 32px; height: 32px; flex: none; border-radius: 50%; background: var(--accent-tint); display: grid; place-items: center; }
    .face img { width: 78%; height: 78%; display: block; }
    .name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    @media (max-width: 600px) { .me { max-width: 130px; } }
    /* The smallest phones: just your animal. */
    @media (max-width: 380px) { .me { padding: 0 3px; } .name { display: none; } }
  `,
})
export class MeChip {
    protected readonly auth = inject(AuthService);
    protected readonly profile = inject(ProfileService);
    protected readonly picture = computed(() => avatarUrl(this.profile.avatar()));
    protected readonly label = avatarLabel;
}
