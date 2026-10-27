import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, OAuthProvider, PROVIDER_LABEL } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';
import { SessionService } from '../../core/session.service';
import { PageHeader } from '../../shared/page-header/page-header';

type Mode = 'create' | 'signin';

/** Both password fields must be the same. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
    const password = group.get('password')?.value;
    const confirm = group.get('confirm')?.value;
    return password && confirm && password !== confirm ? { passwordsDiffer: true } : null;
}

@Component({
    selector: 'app-account',
    imports: [ReactiveFormsModule, PageHeader, NgTemplateOutlet],
    templateUrl: './account.html',
    styleUrl: './account.css',
})
export class Account {
    protected readonly auth = inject(AuthService);
    private readonly profile = inject(ProfileService);
    private readonly sessions = inject(SessionService);
    private readonly router = inject(Router);

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
        this.busy.set(false);
        this.createForm.reset();
        this.signInForm.reset();
    }

    protected goHome(): void {
        this.router.navigate(['/']);
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
