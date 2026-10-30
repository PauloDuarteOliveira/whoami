import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE } from './supabase.client';
import { isDigit, isLetter } from '../shared/validators';

export type AuthStatus = 'loading' | 'ready' | 'error';

export type OAuthProvider = 'google' | 'discord';
export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Google', discord: 'Discord' };

interface PendingOAuth {
    provider: OAuthProvider;
    retried: boolean;
}
const PENDING_KEY = 'whoami.oauth';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly client = inject(SUPABASE);

    readonly session = signal<Session | null>(null);
    readonly status = signal<AuthStatus>('loading');
    readonly userId = computed(() => this.session()?.user.id ?? null);
    readonly isAnonymous = computed(() => this.session()?.user.is_anonymous ?? true);
    readonly email = computed(() => this.session()?.user.email ?? null);
    readonly accountName = computed(() => accountNameOf(this.session()));
    readonly providers = computed(() => (this.session()?.user.identities ?? []).map(identity => identity.provider));
    readonly oauthError = signal<string | null>(null);

    constructor() {
        this.client.auth.onAuthStateChange((_event, session) => this.session.set(session));
    }

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

    async continueWith(provider: OAuthProvider): Promise<string | null> {
        this.oauthError.set(null);
        savePending({ provider, retried: false });
        const linked = await this.client.auth.linkIdentity({ provider, options: { redirectTo: returnUrl() } });
        if (!linked.error) return null;
        if (linked.error.code === 'manual_linking_disabled') return this.signInWithProvider(provider);
        clearPending();
        return oauthError(linked.error, provider);
    }

    async createAccount(email: string, password: string, name: string): Promise<string | null> {
        const withEmail = await this.client.auth.updateUser({ email, data: { name } });
        if (withEmail.error) return friendlyError(withEmail.error);
        const withPassword = await this.client.auth.updateUser({ password });
        if (withPassword.error) return friendlyError(withPassword.error);
        return null;
    }

    async signInWithEmail(email: string, password: string): Promise<string | null> {
        const result = await this.client.auth.signInWithPassword({ email, password });
        return result.error ? friendlyError(result.error) : null;
    }

    async deleteAccount(): Promise<string | null> {
        const { error } = await this.client.rpc('delete_my_account');
        if (error) {
            const missing = error.code === 'PGRST202' || error.message.toLowerCase().includes('could not find the function');
            return missing ? "Deleting accounts isn't switched on yet." : "Couldn't delete your account. Check your connection and try again.";
        }
        await this.client.auth.signOut({ scope: 'local' });
        await this.signIn();
        return null;
    }

    async signOut(): Promise<void> {
        await this.client.auth.signOut();
        await this.signIn();
    }

    private async signInWithProvider(provider: OAuthProvider): Promise<string | null> {
        const result = await this.client.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl(), skipBrowserRedirect: true } });
        if (result.error || !result.data.url) {
            clearPending();
            return result.error ? oauthError(result.error, provider) : `Couldn't open ${PROVIDER_LABEL[provider]}.`;
        }
        const problem = await providerProblem(result.data.url);
        if (problem) {
            clearPending();
            return problem.includes('not enabled') ? `${PROVIDER_LABEL[provider]} sign-in isn't switched on yet.` : `Couldn't open ${PROVIDER_LABEL[provider]}. Try again.`;
        }
        location.assign(result.data.url);
        return null;
    }

    private async finishOAuth(errorCode: string | null, errorText: string | null): Promise<void> {
        const pending = readPending();
        if (errorCode === 'identity_already_exists' && pending && !pending.retried) {
            savePending({ ...pending, retried: true });
            const failed = await this.signInWithProvider(pending.provider);
            if (failed) this.oauthError.set(failed);
            return;
        }
        clearPending();
        if (errorCode || errorText) this.oauthError.set(returnError(errorCode, pending?.provider ?? null));
    }
}

function returnUrl(): string {
    return `${location.origin}${location.pathname}`;
}

function readOAuthReturn(): { errorCode: string | null; errorText: string | null } | null {
    if (!readPending()) return null;
    const url = new URL(location.href);
    const errorCode = url.searchParams.get('error_code');
    const errorText = url.searchParams.get('error_description') ?? url.searchParams.get('error');
    for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
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
        /* storage blocked */
    }
}

function clearPending(): void {
    try {
        sessionStorage.removeItem(PENDING_KEY);
    } catch {
        /* storage blocked */
    }
}

function accountNameOf(session: Session | null): string | null {
    const meta = session?.user.user_metadata ?? {};
    const claims = (meta['custom_claims'] ?? {}) as Record<string, unknown>;
    const candidates = [meta['name'], meta['full_name'], claims['global_name'], meta['user_name']];
    const found = candidates.find(value => typeof value === 'string' && value.trim() !== '');
    return (found as string | undefined) ?? null;
}

export function playerName(name: string | null): string | null {
    if (!name) return null;
    const kept = [...name].filter(char => char === ' ' || isLetter(char) || isDigit(char)).join('');
    const clean = kept.split(' ').filter(word => word !== '').join(' ').slice(0, 16).trim();
    return clean.length >= 2 ? clean : null;
}

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

function oauthError(error: AuthError, provider: OAuthProvider): string {
    const label = PROVIDER_LABEL[provider];
    if (error.message.toLowerCase().includes('not enabled')) return `${label} sign-in isn't switched on yet.`;
    return `Couldn't open ${label}. Check your connection and try again.`;
}

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
