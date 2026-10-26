import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { Player, Room } from '../../../core/models';
import { SettingsSummary } from '../../../shared/settings-summary/settings-summary';
import { RoomTop } from '../room-top/room-top';
import { Roster } from '../roster/roster';

export const MIN_PLAYERS = 2;

/** The lobby (design Layout A): the Players rail, the code to share, the settings and Start. */
@Component({
  selector: 'app-lobby',
  imports: [DatePipe, RoomTop, Roster, SettingsSummary],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class Lobby {
  @Input({ required: true }) room!: Room;
  @Input({ required: true }) players: Player[] = [];
  @Input({ required: true }) me!: Player;
  @Input() deckName: string | null = null;
  @Input() connectionLost = false;
  @Input({ required: true }) isOnline!: (player: Player) => boolean;
  @Input() starting = false;

  @Output() start = new EventEmitter<void>();
  @Output() leave = new EventEmitter<void>();
  @Output() kick = new EventEmitter<Player>();
  @Output() toggleHelper = new EventEmitter<Player>();
  @Output() handOver = new EventEmitter<Player>();

  protected readonly copied = signal<'code' | 'link' | null>(null);
  protected readonly minPlayers = MIN_PLAYERS;

  protected get isAdmin(): boolean {
    return this.me.role === 'admin';
  }

  protected get playing(): Player[] {
    return this.players.filter(p => p.role !== 'spectator');
  }

  protected inviteLink(): string {
    return `${location.origin}${location.pathname}#/join/${this.room.code}`;
  }

  protected copy(what: 'code' | 'link'): void {
    const text = what === 'code' ? this.room.code : this.inviteLink();
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(what);
      setTimeout(() => this.copied.set(null), 1500);
    });
  }
}
