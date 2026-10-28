import { Component, EventEmitter, OnInit, Output, computed, effect, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AccountSync } from '../../core/account-sync.service';
import { AuthService, OAuthProvider, PROVIDER_LABEL } from '../../core/auth.service';
import { HistoryService, OpenRoom } from '../../core/history.service';
import { MyGames } from '../../core/my-games.service';
import { ProfileService } from '../../core/profile.service';
import { SessionService } from '../../core/session.service';
import { AvatarChoice } from '../../shared/avatar-choice';
import { isAvatar } from '../../shared/avatars';
import { badgesFor } from '../../shared/badges';
import { maskEmail } from '../../shared/mask-email';
import { SettingsSummary } from '../../shared/settings-summary/settings-summary';
import { playerNameValidators } from '../../shared/validators';

/**
 * Your account → Overview (the concept's layout): who you are and how you sign in on the left,
 * with your room settings and Delete; Continue playing, your numbers, recent games and badges on the right.
 */
@Component({
    selector: 'app-account-overview',
    imports: [ReactiveFormsModule, RouterLink, AvatarChoice, SettingsSummary],
    templateUrl: './account-overview.html',
    styleUrl: './account-overview.css',
})
export class AccountOverview implements OnInit {
    protected readonly auth = inject(AuthService);
    protected readonly profile = inject(ProfileService);
    protected readonly account = inject(AccountSync);
    protected readonly my = inject(MyGames);
    private readonly history = inject(HistoryService);
    private readonly sessions = inject(SessionService);
    private readonly router = inject(Router);

    @Output() signOut = new EventEmitter<void>();
    @Output() deleteAccount = new EventEmitter<void>();

    protected readonly quick: OAuthProvider[] = ['google', 'discord'];
    protected readonly label = PROVIDER_LABEL;
    protected readonly email = computed(() => maskEmail(this.auth.email()));
    /** "Signed in with Google": the first way this account signs in. */
    protected readonly signedInWith = computed(() => {
        const first = this.auth.providers().find(p => p !== 'anonymous');
        return first === 'google' || first === 'discord' ? PROVIDER_LABEL[first] : first === 'email' ? 'email' : null;
    });

    /** Your name, editable here; it shows in the header and follows you to every device. */
    protected readonly nameControl = new FormControl(this.profile.name(), { nonNullable: true, validators: playerNameValidators });
    protected readonly nameSaved = signal(false);
    protected readonly connecting = signal(false);

    protected readonly openRooms = signal<OpenRoom[]>([]);
    protected readonly phaseLabel: Record<OpenRoom['room']['status'], string> = { lobby: 'Lobby', writing: 'Writing characters', playing: 'Game in progress', finished: 'Game over · back in the lobby' };

    /** Badges preview: earned ones first, then the ones you're closest to. */
    protected readonly badges = computed(() => {
        const all = badgesFor(this.my.games());
        const sorted = [...all].sort((a, b) => Number(b.earned) - Number(a.earned) || b.current / b.target - a.current / a.target);
        return { earned: all.filter(b => b.earned).length, total: all.length, preview: sorted.slice(0, 6) };
    });
    protected readonly recent = computed(() => this.my.games().slice(0, 4));

    constructor() {
        // The account's name can arrive just after the page opens (a new device): keep the box in step
        // until the player starts typing.
        effect(() => {
            const name = this.profile.name();
            if (!this.nameControl.dirty) this.nameControl.setValue(name, { emitEvent: false });
        });
    }

    ngOnInit(): void {
        this.my.load();
        const userId = this.auth.userId();
        if (userId) this.history.openRooms(userId).subscribe({ next: rooms => this.openRooms.set(rooms), error: () => undefined });
    }

    protected setAvatar(avatar: string): void {
        if (isAvatar(avatar)) this.profile.setAvatar(avatar);
    }

    protected nameChanged(): boolean {
        return this.nameControl.value.trim() !== this.profile.name();
    }

    protected saveName(): void {
        if (this.nameControl.invalid || !this.nameChanged()) {
            this.nameControl.markAsTouched();
            return;
        }
        this.profile.setName(this.nameControl.value);
        this.nameControl.reset(this.profile.name());
        this.nameSaved.set(true);
        setTimeout(() => this.nameSaved.set(false), 2500);
    }

    protected async connect(provider: OAuthProvider): Promise<void> {
        if (this.connecting()) return;
        this.connecting.set(true);
        const message = await this.auth.continueWith(provider);
        if (message) {
            this.auth.oauthError.set(message);
            this.connecting.set(false);
        }
    }

    protected rejoin(r: OpenRoom): void {
        this.sessions.save(r.room.code, r.id);
        // A finished game: straight back to the lobby after it, not the results again.
        this.router.navigate(['/room', r.room.code], r.room.status === 'finished' ? { queryParams: { lobby: 1 } } : {});
    }

    protected resultText(g: { status: string; finish_place: number | null; questions_asked: number }): string {
        if (g.status === 'finished') return g.finish_place === 1 ? `★ Guessed in ${g.questions_asked}` : `Guessed in ${g.questions_asked}`;
        return g.status === 'gave_up' ? 'Gave up' : "Didn't guess";
    }

    protected resultKind(g: { status: string; finish_place: number | null }): string {
        if (g.status === 'finished') return g.finish_place === 1 ? 'best' : 'yes';
        return g.status === 'gave_up' ? 'no' : 'plain';
    }
}
