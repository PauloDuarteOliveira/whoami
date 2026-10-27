import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE } from './supabase.client';
import { ProfileService } from './profile.service';
import { isDigit, isLetter } from '../shared/validators';

export type AuthStatus = 'loading' | 'ready' | 'error';

/** The quick sign-ins (set up in Supabase → Authentication → Providers). */
export type OAuthProvider = 'google' | 'discord';
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', discord: 'Discord' };

/** What this tab is waiting for while it's away at Google or Discord (sessionStorage survives the trip). */
interface PendingOAuth {
    provider: OAuthProvider;
    /** Already switched from "link to this guest" to "sign in to the existing account" once. */
    retried: boolean;
}
const PENDING_KEY = 'whoami.oauth';

/**
 * Signs every player in with Supabase Auth, invisibly (an anonymous account: no email, no password).
 * The game data still goes through HttpClient; the auth interceptor adds this session's token to each request,
 * so the database knows which signed-in user is asking (auth.uid() in Row Level Security).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly client = inject(SUPABASE);
    private readonly profile = inject(ProfileService);

    readonly session = signal<Session | null>(null);
    readonly status = signal<AuthStatus>('loading');
    readonly userId = computed(() => this.session()?.user.id ?? null);
    /** True for the invisible guest account; false once the player has an email, Google or Discord account. */
    readonly isAnonymous = computed(() => this.session()?.user.is_anonymous ?? true);
    readonly email = computed(() => this.session()?.user.email ?? null);
    /** The name saved with the account (or given by Google / Discord), so it follows the player to other devices. */
    readonly accountName = computed(() => accountNameOf(this.session()));
    /** How this account can sign in: 'email', 'google', 'discord'. */
    readonly providers = computed(() => (this.session()?.user.identities ?? []).map(identity => identity.provider));
    /** Why the last trip to Google or Discord didn't work, shown on the Account page. */
    readonly oauthError = signal<string | null>(null);

    constructor() {
        // Keeps the token fresh: Supabase refreshes it about every hour and tells us here.
        this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
    }

    /**
     * Reuses this tab's session if there is one, otherwise creates an anonymous account.
     * Coming back from Google or Discord, supabase-js has already swapped the code in the address for a session.
     */
    async signIn(): Promise<void> {
        this.status.set('loading');
        const returned = readOAuthReturn();
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
            if (returned) await this.finishOAuth(returned.errorCode, returned.errorText);
        } catch {
            this.status.set('error');
        }
    }

    accessToken(): string | null {
        return this.session()?.access_token ?? null;
    }

    /**
     * Continue with Google or Discord. A guest *links* it, so it stays the same player and its games keep going;
     * a signed-in player links it as one more way to sign in. The browser then leaves for the provider.
     * Returns an error message, or null when the browser is on its way.
     */
    async continueWith(provider: OAuthProvider): Promise<string | null> {
        this.oauthError.set(null);
        savePending({ provider, retried: false });
        const linked = await this.client.auth.linkIdentity({ provider, options: { redirectTo: returnUrl() } });
        if (!linked.error) return null;
        // Linking switched off in Supabase: sign in to the provider's account instead (the guest's games stay behind).
        if (linked.error.code === 'manual_linking_disabled') return this.signInWithProvider(provider);
        clearPending();
        return oauthError(linked.error, provider);
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

    /** Leaves the account and goes back to a fresh guest account, so the app keeps working. */
    async signOut(): Promise<void> {
        await this.client.auth.signOut();
        await this.signIn();
    }

    /** Signs in to the account that already owns this Google / Discord login. */
    private async signInWithProvider(provider: OAuthProvider): Promise<string | null> {
        const result = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl(), skipBrowserRedirect: true } });
        if (result.error || !result.data.url) {
            clearPending();
            return result.error ? oauthError(result.error, provider) : `Couldn't open ${PROVIDER_LABEL[provider]}.`;
        }
        // Ask Supabase first: if the provider is switched off it answers with an error instead of sending the
        // player to Google / Discord, and the player would land on a page of raw JSON.
        const problem = await providerProblem(result.data.url);
        if (problem) {
            clearPending();
            return problem.includes('not enabled') ? `${PROVIDER_LABEL[provider]} sign-in isn't switched on yet.` : `Couldn't open ${PROVIDER_LABEL[provider]}. Try again.`;
        }
        location.assign(result.data.url);
        return null;
    }

    /** Back from Google or Discord: done, or one more step, or an error to show. */
    private async finishOAuth(errorCode: string | null, errorText: string | null): Promise<void> {
        const pending = readPending();
        // This Google / Discord login already belongs to an account (the player signed in on another device before):
        // sign in to that account instead. Only once, so a real error can't loop.
        if (errorCode === 'identity_already_exists' && pending && !pending.retried) {
            savePending({ ...pending, retried: true });
            const failed = await this.signInWithProvider(pending.provider);
            if (failed) this.oauthError.set(failed);
            return;
        }
        clearPending();
        if (errorCode || errorText) {
            this.oauthError.set(returnError(errorCode, pending?.provider ?? null));
            return;
        }
        // Signed in: a guest who hasn't typed a name yet gets the one from Google / Discord.
        const name = playerName(this.accountName());
        if (name && !this.profile.name()) this.profile.setName(name);
    }
}

/** Where Google / Discord send the player back: this page, without the #/route (the app then opens Your account). */
function returnUrl(): string {
    return `${location.origin}${location.pathname}`;
}

/**
 * Reads (and removes) what Google / Discord left in the address, before the router starts.
 * Returns null when this page load isn't a return from a provider.
 */
function readOAuthReturn(): { errorCode: string | null; errorText: string | null } | null {
    if (!readPending()) return null;
    const url = new URL(location.href);
    const errorCode = url.searchParams.get('error_code');
    const errorText = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
    // Land on Your account, which shows the result.
    url.hash = '#/account';
    history.replaceState(history.state, '', url.toString());
    return { errorCode, errorText };
}

function readPending(): PendingOAuth | null {
    try {
        const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') as PendingOAuth | null;
        return saved && (saved.provider === 'google' || saved.provider === 'discord') ? saved : null;
    } catch {
        return null;
    }
}

function savePending(pending: PendingOAuth): void {
    try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
        // Storage blocked: the return still signs in, it just can't retry.
    }
}

function clearPending(): void {
    try {
        sessionStorage.removeItem(PENDING_KEY);
    } catch {
        // Nothing to clear.
    }
}

/** The account's name: one the player saved, or the one Google / Discord gave. */
function accountNameOf(session: Session | null): string | null {
    const meta = session?.user.user_metadata ?? {};
    const claims = (meta['custom_claims'] ?? {}) as Record<string, unknown>;
    const candidates = [meta['name'], meta['full_name'], claims['global_name'], meta['user_name']];
    const found = candidates.find(value => typeof value === 'string' && value.trim() !== '');
    return (found as string | undefined) ?? null;
}

/** A provider name made fit for the game: letters, numbers and spaces, 2 to 16 characters ("maya_99" → "maya99"). */
function playerName(name: string | null): string | null {
    if (!name) return null;
    const kept = [...name].filter(char => char === ' ' || isLetter(char) || isDigit(char)).join('');
    const clean = kept.split(' ').filter(word => word !== '').join(' ').slice(0, 16).trim();
    return clean.length >= 2 ? clean : null;
}

/**
 * Supabase's sign-in address either redirects to the provider (fine) or answers with an error.
 * Returns the error text in lower case, or null when it's fine (or can't be checked: then we just go).
 */
async function providerProblem(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, { redirect: 'manual' });
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) return null;
        if (response.ok) return null;
        const body = (await response.json()) as { msg?: string; message?: string; error_description?: string };
        return (body.msg ?? body.message ?? body.error_description ?? 'error').toLowerCase();
    } catch {
        return null;
    }
}

/** Errors from starting a Google / Discord sign-in. */
function oauthError(error: AuthError, provider: OAuthProvider): string {
    const label = PROVIDER_LABEL[provider];
    if (error.message.toLowerCase().includes('not enabled')) return `${label} sign-in isn't switched on yet.`;
    return `Couldn't open ${label}. Check your connection and try again.`;
}

/** Errors Google / Discord / Supabase sent back in the address. */
function returnError(code: string | null, provider: OAuthProvider | null): string {
    const label = provider ? PROVIDER_LABEL[provider] : 'That account';
    switch (code) {
        case 'identity_already_exists':
            return `This ${label} account is already used by another player.`;
        case 'access_denied':
            return `${label} sign-in was cancelled.`;
        default:
            return `${label} sign-in didn't work. Try again.`;
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
