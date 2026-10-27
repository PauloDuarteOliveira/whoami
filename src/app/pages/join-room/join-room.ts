import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { Player, Room } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { ProfileService } from '../../core/profile.service';
import { RoomService } from '../../core/room.service';
import { SessionService } from '../../core/session.service';
import { PageHeader } from '../../shared/page-header/page-header';
import { AvatarChoice } from '../../shared/avatar-choice';
import { avatarLabel, freeAvatar, isAvatar } from '../../shared/avatars';
import { isCodeChar, playerNameValidators, roomCodeValidators } from '../../shared/validators';

type LookupState = 'idle' | 'checking' | 'found' | 'missing' | 'error';

@Component({
    selector: 'app-join-room',
    imports: [ReactiveFormsModule, PageHeader, AvatarChoice],
    templateUrl: './join-room.html',
    styleUrl: './join-room.css',
})
export class JoinRoom implements OnInit {
    private readonly rooms = inject(RoomService);
    private readonly playerService = inject(PlayerService);
    private readonly session = inject(SessionService);
    private readonly profile = inject(ProfileService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly destroyRef = inject(DestroyRef);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    protected readonly form = new FormGroup({
        code: new FormControl('', { nonNullable: true, validators: roomCodeValidators }),
        name: new FormControl(this.profile.name(), { nonNullable: true, validators: playerNameValidators }),
    });

    protected readonly lookupState = signal<LookupState>('idle');
    protected readonly room = signal<Room | null>(null);
    protected readonly players = signal<Player[]>([]);

    protected readonly joining = signal(false);
    protected readonly joinError = signal<string | null>(null);

    protected readonly present = computed(() =>
        this.players().filter(p => p.status !== 'kicked' && p.status !== 'left'),
    );

    /** Animals already taken in this room; yours moves to a free one if it's among them. */
    protected readonly takenAvatars = computed(() => this.present().map(p => p.avatar ?? null).filter(a => a !== null));
    private readonly chosenAvatar = signal<string | null>(null);
    protected readonly avatar = computed(() => this.chosenAvatar() ?? freeAvatar(this.profile.avatar(), this.takenAvatars()));
    /** The animal you had, when it's taken here (null when you got your own). */
    protected readonly avatarMoved = computed(() =>
        !this.chosenAvatar() && this.avatar() !== this.profile.avatar() ? avatarLabel(this.profile.avatar()).toLowerCase() : null,
    );

    protected pickAvatar(avatar: string): void {
        if (!isAvatar(avatar)) return;
        this.chosenAvatar.set(avatar);
        this.profile.setAvatar(avatar);
    }

    protected readonly adminName = computed(() =>
        this.players().find(p => p.role === 'admin')?.name ?? 'Someone',
    );

    protected get code() {
        return this.form.controls.code;
    }

    protected get name() {
        return this.form.controls.name;
    }

    ngOnInit(): void {
        this.code.valueChanges
            .pipe(
                tap(() => this.joinError.set(null)),
                debounceTime(300),
                distinctUntilChanged(),
                switchMap(code => this.lookUp(code)),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();

        // From an invite link or QR code the code is already filled in, so only the name may be left to type.
        const fromLink = this.route.snapshot.paramMap.get('code');
        if (fromLink) {
            this.code.setValue(fromLink.toUpperCase());
        }
        const firstEmpty = !fromLink ? 'code' : this.name.value ? null : 'name';
        if (firstEmpty) setTimeout(() => this.host.nativeElement.querySelector<HTMLInputElement>('#' + firstEmpty)?.focus());
    }

    protected upperCaseCode(): void {
        const clean = [...this.code.value.toUpperCase()].filter(isCodeChar).join('');
        if (clean !== this.code.value) {
            this.code.setValue(clean);
        }
    }

    protected submit(): void {
        const room = this.room();
        if (this.form.invalid || !room || this.joining()) {
            this.form.markAllAsTouched();
            return;
        }

        const knownId = this.session.getPlayerId(room.code);
        if (this.players().some(p => p.id === knownId && p.status !== 'kicked')) {
            this.router.navigate(['/room', room.code]);
            return;
        }

        this.joining.set(true);
        this.joinError.set(null);
        this.profile.setName(this.name.value);
        const role = room.status === 'lobby' ? 'player' : 'spectator';
        const takenColors = this.players().map(p => p.color);

        this.playerService.join(room.id, this.profile.name(), role, takenColors, this.avatar()).subscribe({
            next: player => {
                this.session.save(room.code, player.id);
                this.router.navigate(['/room', room.code]);
            },
            error: (err: HttpErrorResponse) => {
                this.joinError.set(err.status === 409 ? 'That name is already taken in this room.' : 'Could not join. Try again.');
                this.joining.set(false);
            },
        });
    }

    private lookUp(code: string): Observable<unknown> {
        if (this.code.invalid) {
            this.lookupState.set('idle');
            this.room.set(null);
            return of(null);
        }
        this.lookupState.set('checking');

        return this.rooms.getByCode(code).pipe(
            switchMap(room =>
                room ? this.playerService.getPlayers(room.id).pipe(map(players => ({ room, players }))) : of(null),
            ),
            tap(result => {
                if (result) {
                    this.room.set(result.room);
                    this.players.set(result.players);
                    this.lookupState.set('found');
                } else {
                    this.room.set(null);
                    this.lookupState.set('missing');
                }
            }),
            catchError(() => {
                this.room.set(null);
                this.lookupState.set('error');
                return of(null);
            }),
        );
    }
}