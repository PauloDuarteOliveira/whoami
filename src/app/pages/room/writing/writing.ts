import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Character, Player, Room } from '../../../core/models';
import { characterNameValidators } from '../../../shared/validators';
import { plural } from '../../../shared/format';
import { RoomTop } from '../room-top/room-top';
import { Roster } from '../roster/roster';

/** The writing phase (design Layout A): the Players rail with who's done, and your character to write. */
@Component({
  selector: 'app-writing',
  imports: [ReactiveFormsModule, RoomTop, Roster],
  templateUrl: './writing.html',
  styleUrl: './writing.css',
})
export class Writing implements OnChanges {
  protected readonly plural = plural;

  @Input({ required: true }) room!: Room;
  @Input({ required: true }) players: Player[] = [];
  @Input({ required: true }) me!: Player;
  @Input({ required: true }) characters: Character[] = [];
  @Input() now = Date.now();
  @Input() busy = false;
  @Input() notice: string | null = null;
  /** Everyone still in the room, watchers included (for the Players rail). */
  @Input({ required: true }) everyone: Player[] = [];
  @Input({ required: true }) isOnline!: (player: Player) => boolean;
  @Input() connectionLost = false;

  @Output() write = new EventEmitter<string>();
  @Output() startWithout = new EventEmitter<void>();
  @Output() addTime = new EventEmitter<void>();
  @Output() leave = new EventEmitter<void>();
  @Output() kick = new EventEmitter<Player>();
  @Output() toggleHelper = new EventEmitter<Player>();
  @Output() handOver = new EventEmitter<Player>();
  @Output() toggleMute = new EventEmitter<Player>();

  protected readonly character = new FormControl('', { nonNullable: true, validators: characterNameValidators });
  protected readonly bounced = signal<string | null>(null);
  protected readonly dismissedAt = signal<number | null>(null);

  private lastMine: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['characters']) {
      const mine = this.mine();
      if (mine) {
        this.lastMine = mine.name;
        this.bounced.set(null);
      } else if (this.lastMine) {
        this.bounced.set(this.lastMine);
        this.lastMine = null;
      }
    }
  }

  protected mine(): Character | undefined {
    return this.characters.find(c => c.written_by === this.me.id);
  }

  protected hasWritten(p: Player): boolean {
    return this.characters.some(c => c.written_by === p.id);
  }

  protected doneCount(): number {
    return this.players.filter(p => this.hasWritten(p)).length;
  }

  protected missing(): Player[] {
    return this.players.filter(p => !this.hasWritten(p));
  }

  protected isPlayer(): boolean {
    return this.players.some(p => p.id === this.me.id);
  }

  protected secondsLeft(): number | null {
    if (!this.room.writing_ends_at) return null;
    return Math.max(0, Math.ceil((new Date(this.room.writing_ends_at).getTime() - this.now) / 1000));
  }

  protected clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  protected showDecision(): boolean {
    const runsTheRoom = this.me.role === 'admin' || this.me.role === 'helper';
    if (!runsTheRoom || !this.mine() || this.missing().length === 0) return false;
    const left = this.secondsLeft();
    if (left !== null) return left === 0;
    return this.dismissedAt() !== this.doneCount();
  }

  protected submit(): void {
    if (this.character.invalid || this.busy) {
      this.character.markAsTouched();
      return;
    }
    this.bounced.set(null);
    this.write.emit(this.character.value);
    this.character.reset('');
  }
}