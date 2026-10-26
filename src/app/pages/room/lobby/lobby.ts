import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { Player, Room } from '../../../core/models';
import { PlayerRow } from '../../../shared/player-row/player-row';
import { SkySwitch } from '../../../shared/sky-switch/sky-switch';
import { SettingsSummary } from '../../../shared/settings-summary/settings-summary';

export const MIN_PLAYERS = 2;

@Component({
  selector: 'app-lobby',
  imports: [DatePipe, PlayerRow, SettingsSummary, SkySwitch],
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

  protected get canManage(): boolean {
    return this.me.role === 'admin' || this.me.role === 'helper';
  }

  protected get playing(): Player[] {
    return this.players.filter(p => p.role !== 'spectator');
  }

  protected get watching(): Player[] {
    return this.players.filter(p => p.role === 'spectator');
  }

  protected canManagePlayer(p: Player): boolean {
    return this.canManage && p.role !== 'admin';
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