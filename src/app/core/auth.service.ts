import { Injectable, computed, signal } from '@angular/core';
import { Session, createClient } from '@supabase/supabase-js';
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
