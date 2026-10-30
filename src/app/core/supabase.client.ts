import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

export const SUPABASE = new InjectionToken<SupabaseClient>('Supabase client', {
    providedIn: 'root',
    factory: () =>
        createClient(environment.supabaseUrl, environment.supabaseKey, {
            auth: {
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

function browserSessionStorage(): Storage | undefined {
    try {
        return window.sessionStorage;
    } catch {
        return undefined;
    }
}
