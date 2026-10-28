import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Character, ChatMessage, Player, Question, Room } from '../../../core/models';
import { RoomSettings } from '../../../core/room.service';
import { AvatarFace } from '../../../shared/avatar-face';
import { Chat } from '../chat/chat';
import { History } from '../history/history';
import { Invite } from '../invite/invite';
import { NextGame } from '../next-game/next-game';
import { PlayersPanel } from '../players-panel/players-panel';
import { RoomTop } from '../room-top/room-top';

/**
 * The lobby after a game ("Back to lobby" on the results): the same room and code. Last game's cards
 * (characters and results) on the left, the code / QR code to invite more friends in the middle,
 * last game's History and the chat on the right. Only the Admin sees the Next game settings and Play again.
 */
@Component({
  selector: 'app-after-game',
  imports: [RoomTop, PlayersPanel, Invite, NextGame, History, Chat, AvatarFace],
  templateUrl: './after-game.html',
  styleUrl: './after-game.css',
})
export class AfterGame {
  @Input({ required: true }) room!: Room;
  /** Everyone in the room now (not kicked, not gone). */
  @Input({ required: true }) players: Player[] = [];
  @Input({ required: true }) me!: Player;
  @Input({ required: true }) characters: Character[] = [];
  @Input({ required: true }) questions: Question[] = [];
  @Input({ required: true }) isOnline!: (player: Player) => boolean;
  @Input() messages: ChatMessage[] = [];
  @Input() everyone: Player[] = [];
  @Input() busy = false;
  @Input() connectionLost = false;

  @Output() leave = new EventEmitter<void>();
  @Output() playAgain = new EventEmitter<RoomSettings>();
  @Output() sendMessage = new EventEmitter<string>();
  @Output() kick = new EventEmitter<Player>();
  @Output() toggleHelper = new EventEmitter<Player>();
  @Output() handOver = new EventEmitter<Player>();
  @Output() toggleMute = new EventEmitter<Player>();

  protected get isAdmin(): boolean {
    return this.me.role === 'admin';
  }

  protected get admin(): Player | null {
    return this.players.find(p => p.role === 'admin') ?? null;
  }

  /** Everyone here plays the next game, including those who joined to watch. */
  protected get nextPlayers(): number {
    return this.players.length;
  }
}
