import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatMessage, Player, Room } from '../../../core/models';
import { SettingsSummary } from '../../../shared/settings-summary/settings-summary';
import { RoomTop } from '../room-top/room-top';
import { Roster } from '../roster/roster';
import { Chat } from '../chat/chat';
import { Invite } from '../invite/invite';

export const MIN_PLAYERS = 2;

@Component({
  selector: 'app-lobby',
  imports: [DatePipe, RoomTop, Roster, SettingsSummary, Chat, Invite],
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
  @Input() messages: ChatMessage[] = [];
  @Input() everyone: Player[] = [];

  @Output() start = new EventEmitter<void>();
  @Output() leave = new EventEmitter<void>();
  @Output() kick = new EventEmitter<Player>();
  @Output() toggleHelper = new EventEmitter<Player>();
  @Output() handOver = new EventEmitter<Player>();
  @Output() sendMessage = new EventEmitter<string>();
  @Output() toggleMute = new EventEmitter<Player>();
  @Output() changeAvatar = new EventEmitter<string>();

  protected readonly minPlayers = MIN_PLAYERS;

  protected get isAdmin(): boolean {
    return this.me.role === 'admin';
  }

  protected get playing(): Player[] {
    return this.players.filter(p => p.role !== 'spectator');
  }
}
