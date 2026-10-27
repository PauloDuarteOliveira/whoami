import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * The one supabase-js client of the app, shared by sign-in (AuthService) and live updates (RealtimeService),
 * so the live connection uses the same signed-in player and Row Level Security applies to it too.
 * The game data itself still goes through HttpClient.
 */
export const SUPABASE = new InjectionToken<SupabaseClient>('Supabase client', {
    providedIn: 'root',
    factory: () =>
        createClient(environment.supabaseUrl, environment.supabaseKey, {
            auth: {
                // One session per tab, like the player sessions, so two tabs are two different players.
                // The key is unique per tab because supabase-js also shares sign-ins between tabs with the same key
                // (a BroadcastChannel named after it): with one shared key, a new tab would switch the others to its user.
                storage: browserSessionStorage(),
                storageKey: `whoami.auth.${tabId()}`,
                persistSession: true,
                autoRefreshToken: true,
                // Google / Discord send the player back with ?code=… (PKCE), not with tokens after the #:
                // the # belongs to the app's routes (#/room/K7QX), and supabase-js removes the code once it's used.
                flowType: 'pkce',
                detectSessionInUrl: true,
            },
        }),
});

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
