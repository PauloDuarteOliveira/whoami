import { Injectable, computed, signal } from '@angular/core';
import { AuthError, Session, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export type AuthStatus = 'loading' | 'ready' | 'error';

/**
 * Signs every player in with Supabase Auth, invisibly (an anonymous account: no email, no password).
 * The game data still goes through HttpClient; the auth interceptor adds this session's token to each request,
 * so the database knows which signed-in user is asking (auth.uid() in Row Level Security).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly client = createClient(environment.supabaseUrl, environment.supabaseKey, {
        auth: {
            // One session per tab, like the player sessions, so two tabs are two different players.
            // The key is unique per tab because supabase-js also shares sign-ins between tabs with the same key
            // (a BroadcastChannel named after it): with one shared key, a new tab would switch the others to its user.
            storage: browserSessionStorage(),
            storageKey: `whoami.auth.${tabId()}`,
            persistSession: true,
            autoRefreshToken: true,
        },
    });

    readonly session = signal<Session | null>(null);
    readonly status = signal<AuthStatus>('loading');
    readonly userId = computed(() => this.session()?.user.id ?? null);
    /** True for the invisible guest account; false once the player has an email account. */
    readonly isAnonymous = computed(() => this.session()?.user.is_anonymous ?? true);
    readonly email = computed(() => this.session()?.user.email ?? null);
    /** The name saved with the account, so it follows the player to other devices. */
    readonly accountName = computed(() => (this.session()?.user.user_metadata?.['name'] as string | undefined) ?? null);

    constructor() {
        // Keeps the token fresh: Supabase refreshes it about every hour and tells us here.
        this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
    }

    /** Reuses this tab's session if there is one, otherwise creates an anonymous account. */
    async signIn(): Promise<void> {
        this.status.set('loading');
        try {
            const { data } = await this.client.auth.getSession();
            let session = data.session;
            if (!session) {
                const result = await this.client.auth.signInAnonymously();
                if (result.error) throw result.error;
                session = result.data.session;
            }
            this.session.set(session);
            this.status.set('ready');
        } catch {
            this.status.set('error');
        }
    }

    accessToken(): string | null {
        return this.session()?.access_token ?? null;
    }

    /**
     * Turns this tab's guest account into an email account. It stays the same user,
     * so the players it already owns keep working. Returns an error message, or null when it worked.
     */
    async createAccount(email: string, password: string, name: string): Promise<string | null> {
        const withEmail = await this.client.auth.updateUser({ email, data: { name } });
        if (withEmail.error) return friendlyError(withEmail.error);
        const withPassword = await this.client.auth.updateUser({ password });
        if (withPassword.error) return friendlyError(withPassword.error);
        return null;
    }

    /** Signs this tab in to an existing email account (instead of the guest account). */
    async signInWithEmail(email: string, password: string): Promise<string | null> {
        const result = await this.client.auth.signInWithPassword({ email, password });
        return result.error ? friendlyError(result.error) : null;
    }

    /** Leaves the email account and goes back to a fresh guest account, so the app keeps working. */
    async signOut(): Promise<void> {
        await this.client.auth.signOut();
        await this.signIn();
    }
}

/** Supabase's error codes turned into short messages for the player. */
function friendlyError(error: AuthError): string {
    switch (error.code) {
        case 'email_exists':
        case 'user_already_exists':
            return 'There is already an account with this email. Sign in instead.';
        case 'invalid_credentials':
            return 'Wrong email or password.';
        case 'weak_password':
            return 'That password is too weak. Use at least 6 characters.';
        case 'email_address_invalid':
            return 'That email address is not valid.';
        case 'over_email_send_rate_limit':
        case 'over_request_rate_limit':
            return 'Too many attempts. Wait a minute and try again.';
        case 'email_not_confirmed':
            return 'Confirm your email first, using the link we sent you.';
        default:
            return 'Something went wrong. Check your connection and try again.';
    }
}

/** A random id for this tab, kept in sessionStorage so it survives a reload but isn't shared with other tabs. */
function tabId(): string {
    try {
        let id = sessionStorage.getItem('whoami.tab');
        if (!id) {
            id = crypto.randomUUID();
            sessionStorage.setItem('whoami.tab', id);
        }
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

/** sessionStorage, or nothing when the browser blocks it (the session then lasts until the page reloads). */
function browserSessionStorage(): Storage | undefined {
    try {
        return window.sessionStorage;
    } catch {
        return undefined;
    }
}
