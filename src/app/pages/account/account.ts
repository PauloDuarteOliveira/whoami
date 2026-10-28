import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService, OAuthProvider, PROVIDER_LABEL } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';
import { SessionService } from '../../core/session.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { GameHistory } from './game-history';
import { AccountOverview } from './account-overview';
import { BadgeGrid } from './badge-grid';
import { MyGames } from '../../core/my-games.service';
import { ListManager } from './list-manager';
import { trapFocus } from '../../shared/focus';

type Mode = 'create' | 'signin';
type Tab = 'overview' | 'history' | 'lists' | 'achievements';
const TABS: { id: Tab; label: string; link: string }[] = [
    { id: 'overview', label: 'Overview', link: '/account' },
    { id: 'history', label: 'History', link: '/account/history' },
    { id: 'lists', label: 'Lists', link: '/account/lists' },
    { id: 'achievements', label: 'Achievements', link: '/account/achievements' },
];

/** Both password fields must be the same. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirm')?.value;
    return password && confirm && password !== confirm ? { passwordsDiffer: true } : null;
}

@Component({
    selector: 'app-account',
    imports: [ReactiveFormsModule, RouterLink, PageHeader, NgTemplateOutlet, GameHistory, ListManager, AccountOverview, BadgeGrid],
    templateUrl: './account.html',
    styleUrl: './account.css',
})
export class Account {
    protected readonly auth = inject(AuthService);
    protected readonly profile = inject(ProfileService);
    protected readonly my = inject(MyGames);
    private readonly route = inject(ActivatedRoute);

    /** Overview · History · Lists · Achievements, from the address (#/account/history…). */
    protected readonly tabs = TABS;
    protected readonly tab = toSignal(
        this.route.paramMap.pipe(map(p => (TABS.find(t => t.id === p.get('tab'))?.id ?? 'overview') as Tab)),
        { initialValue: 'overview' as Tab },
    );
    private readonly sessions = inject(SessionService);
    private readonly router = inject(Router);

    constructor() {
        // Signed in: your games load once for every tab (Overview, History and Achievements all use them),
        // whichever tab the page opens on.
        effect(() => {
            if (!this.auth.isAnonymous()) untracked(() => this.my.load());
        });
    }

    protected readonly mode = signal<Mode>('create');
    protected readonly busy = signal(false);
    protected readonly error = signal<string | null>(null);
    /** The quick sign-ins, in the order they're shown. */
    protected readonly quick: OAuthProvider[] = ['google', 'discord'];
    protected readonly label = PROVIDER_LABEL;

    /** Leaves for Google or Discord; comes back to this page signed in (or with a message). */
    protected async continueWith(provider: OAuthProvider): Promise<void> {
        if (this.busy()) return;
        this.busy.set(true);
        this.error.set(null);
        const message = await this.auth.continueWith(provider);
        // No message: the browser is on its way, so the buttons stay disabled.
        if (message) {
            this.auth.oauthError.set(message);
            this.busy.set(false);
        }
    }

    protected readonly createForm = new FormGroup(
        {
            email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
            password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
            confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
        },
        { validators: passwordsMatch },
    );

    protected readonly signInForm = new FormGroup({
        email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
        password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    });

    protected switchTo(mode: Mode): void {
        this.mode.set(mode);
        this.error.set(null);
    }

    /** Keeps the guest account (and its games) and adds an email and password to it. */
    protected async create(): Promise<void> {
        if (this.createForm.invalid || this.busy()) {
            this.createForm.markAllAsTouched();
            return;
        }
        const { email, password } = this.createForm.getRawValue();
        await this.run(() => this.auth.createAccount(email.trim(), password, this.profile.name()));
    }

    /** Switches this tab to an existing account. The guest's games can't be continued, so they're forgotten. */
    protected async signIn(): Promise<void> {
        if (this.signInForm.invalid || this.busy()) {
            this.signInForm.markAllAsTouched();
            return;
        }
        const { email, password } = this.signInForm.getRawValue();
        const worked = await this.run(() => this.auth.signInWithEmail(email.trim(), password));
        if (worked) {
            this.sessions.forgetAll();
            const name = this.auth.accountName();
            if (name) this.profile.setName(name);
        }
    }

    protected async signOut(): Promise<void> {
        this.busy.set(true);
        await this.auth.signOut();
        this.sessions.forgetAll();
        this.my.reset();
        this.busy.set(false);
        this.createForm.reset();
        this.signInForm.reset();
    }

    protected goHome(): void {
        this.router.navigate(['/']);
    }

    /** "Delete account": typing DELETE unlocks the red button (the email stays hidden on screen). */
    protected readonly deleting = signal(false);
    protected readonly typed = signal('');
    protected readonly deleteError = signal<string | null>(null);
    protected readonly confirmWord = computed(() => 'DELETE');
    protected readonly canDelete = computed(() => this.typed().trim().toLowerCase() === this.confirmWord().toLowerCase());
    private readonly deleteBox = viewChild<ElementRef<HTMLElement>>('deleteBox');

    protected openDelete(): void {
        this.typed.set('');
        this.deleteError.set(null);
        this.deleting.set(true);
        setTimeout(() => this.deleteBox()?.nativeElement.querySelector<HTMLElement>('#delete-confirm')?.focus());
    }

    protected closeDelete(): void {
        if (this.busy()) return;
        this.deleting.set(false);
    }

    protected async deleteAccount(): Promise<void> {
        if (!this.canDelete() || this.busy()) return;
        this.busy.set(true);
        const message = await this.auth.deleteAccount();
        this.busy.set(false);
        if (message) {
            this.deleteError.set(message);
            return;
        }
        // Now a fresh guest: the old account's rooms are forgotten in this tab.
        this.sessions.forgetAll();
        this.my.reset();
        this.deleting.set(false);
        this.accountDeleted.set(true);
    }

    /** Shown once on the guest view after deleting. */
    protected readonly accountDeleted = signal(false);

    @HostListener('document:keydown', ['$event'])
    protected onKey(event: KeyboardEvent): void {
        const box = this.deleteBox()?.nativeElement;
        if (!this.deleting() || !box) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeDelete();
        } else if (event.key === 'Tab') {
            trapFocus(box, event);
        }
    }

    /** Runs an account action with the busy and error states. Returns true when it worked. */
    private async run(action: () => Promise<string | null>): Promise<boolean> {
        this.busy.set(true);
        this.error.set(null);
        const message = await action();
        this.busy.set(false);
        this.error.set(message);
        return message === null;
    }
}
