import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, catchError, map, of, switchMap, timer } from 'rxjs';
import { Player, Room } from './models';
import { PlayerService } from './player.service';
import { RoomService } from './room.service';
import { SessionService } from './session.service';

const POLL_MS = 2_000;
const HEARTBEAT_MS = 10_000;

export type LoadState = 'loading' | 'ready' | 'missing' | 'error';

@Injectable()
export class RoomStore {
  private readonly rooms = inject(RoomService);
  private readonly playerService = inject(PlayerService);
  private readonly session = inject(SessionService);

  readonly room = signal<Room | null>(null);
  readonly players = signal<Player[]>([]);
  readonly loadState = signal<LoadState>('loading');
  readonly connectionLost = signal(false);
  readonly now = signal(Date.now());

  readonly myId = signal<string | null>(null);
  readonly me = computed(() => this.players().find(p => p.id === this.myId()) ?? null);

  private subscriptions = new Subscription();

  start(code: string): void {
    this.stop();
    this.myId.set(this.session.getPlayerId(code));

    this.subscriptions.add(
      timer(0, POLL_MS)
        .pipe(
          switchMap(() =>
            this.rooms.getByCode(code).pipe(
              switchMap(room =>
                room
                  ? this.playerService.getPlayers(room.id).pipe(map(players => ({ room, players })))
                  : of({ room: null, players: [] as Player[] }),
              ),
              catchError(() => of('failed' as const)),
            ),
          ),
        )
        .subscribe(result => {
          this.now.set(Date.now());
          if (result === 'failed') {
            if (this.loadState() === 'loading') this.loadState.set('error');
            this.connectionLost.set(true);
            return;
          }
          this.connectionLost.set(false);
          this.room.set(result.room);
          this.players.set(result.players);
          this.loadState.set(result.room ? 'ready' : 'missing');
        }),
    );

    this.subscriptions.add(
      timer(0, HEARTBEAT_MS)
        .pipe(
          switchMap(() => {
            const id = this.myId();
            return id ? this.playerService.heartbeat(id).pipe(catchError(() => of(null))) : of(null);
          }),
        )
        .subscribe(),
    );
  }

  stop(): void {
    this.subscriptions.unsubscribe();
    this.subscriptions = new Subscription();
  }

  patchPlayer(id: string, changes: Partial<Player>): void {
    this.players.update(list => list.map(p => (p.id === id ? { ...p, ...changes } : p)));
  }
}