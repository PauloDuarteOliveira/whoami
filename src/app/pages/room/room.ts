import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, concat } from 'rxjs';
import { DeckService } from '../../core/deck.service';
import { Deck, Player } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { RoomService } from '../../core/room.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import { Lobby } from './lobby/lobby';

@Component({
  selector: 'app-room',
  imports: [RouterLink, Lobby],
  providers: [RoomStore],
  templateUrl: './room.html',
  styleUrl: './room.css',
})
export class RoomPage implements OnInit, OnDestroy {
  protected readonly store = inject(RoomStore);
  private readonly roomService = inject(RoomService);
  private readonly playerService = inject(PlayerService);
  private readonly decks = inject(DeckService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected code = '';
  private readonly deckList = signal<Deck[]>([]);
  protected readonly deckName = computed(() => this.deckList().find(d => d.id === this.store.room()?.deck_id)?.name ?? null);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly present = computed(() =>
    this.store.players().filter(p => p.status !== 'kicked' && p.status !== 'left'),
  );

  protected readonly isOnline = (player: Player) => this.playerService.isOnline(player, this.store.now());

  ngOnInit(): void {
    this.code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();

    if (!this.session.getPlayerId(this.code)) {
      this.router.navigate(['/join', this.code]);
      return;
    }
    this.store.start(this.code);

    this.decks.getDecks().subscribe({
      next: decks => this.deckList.set(decks),
      error: () => this.deckList.set([]),
    });
  }

  ngOnDestroy(): void {
    this.store.stop();
  }

  protected start(): void {
    const room = this.store.room();
    if (!room) return;
    const custom = room.character_source === 'custom';
    const writingEndsAt = custom && room.writing_timer_sec
      ? new Date(Date.now() + room.writing_timer_sec * 1000).toISOString()
      : null;

    this.run(this.roomService.update(room.id, {
      status: custom ? 'writing' : 'playing',
      writing_ends_at: writingEndsAt,
    }));
  }

  protected kick(player: Player): void {
    if (!confirm(`Kick ${player.name} from the room?`)) return;
    this.store.patchPlayer(player.id, { status: 'kicked' });
    this.run(this.playerService.kick(player.id));
  }

  protected toggleHelper(player: Player): void {
    const role = player.role === 'helper' ? 'player' : 'helper';
    this.store.patchPlayer(player.id, { role });
    this.run(this.playerService.setRole(player.id, role));
  }

  protected leave(): void {
    const me = this.store.me();
    const room = this.store.room();
    if (!me || !room) return;
    const inLobby = room.status === 'lobby';

    const others = this.present().filter(p => p.id !== me.id && p.role !== 'spectator');
    const successor = me.role === 'admin' ? (others.find(p => p.role === 'helper') ?? others[0]) : undefined;

    const steps: Observable<unknown>[] = [];
    if (successor) steps.push(this.playerService.setRole(successor.id, 'admin'));
    steps.push(this.playerService.leave(me, inLobby));

    this.busy.set(true);
    concat(...steps).subscribe({
      error: () => {
        this.busy.set(false);
        this.actionError.set('Could not leave the room. Try again.');
      },
      complete: () => this.goHome(),
    });
  }

  protected goHome(): void {
    this.store.stop();
    this.session.forget(this.code);
    this.router.navigate(['/']);
  }

  private run(action: Observable<unknown>): void {
    this.busy.set(true);
    this.actionError.set(null);
    action.subscribe({
      next: () => this.busy.set(false),
      error: () => {
        this.busy.set(false);
        this.actionError.set('That didn\'t work. Check your connection and try again.');
      },
    });
  }
}