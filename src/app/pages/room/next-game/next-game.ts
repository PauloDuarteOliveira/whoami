import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { DeckService } from '../../../core/deck.service';
import { CharacterList, ListService } from '../../../core/list.service';
import { CharacterSource, Deck, GameMode, Room } from '../../../core/models';
import { RoomSettings } from '../../../core/room.service';

type TurnTimer = RoomSettings['turn_timer_sec'];
type WritingTimer = RoomSettings['writing_timer_sec'];

@Component({
  selector: 'app-next-game',
  templateUrl: './next-game.html',
  styleUrl: './next-game.css',
})
export class NextGame implements OnInit {
  private readonly decks = inject(DeckService);
  private readonly lists = inject(ListService);
  private readonly auth = inject(AuthService);

  @Input({ required: true }) room!: Room;
  @Input() players = 0;
  @Input() busy = false;
  @Output() playAgain = new EventEmitter<RoomSettings>();

  protected readonly signedIn = computed(() => !this.auth.isAnonymous());
  protected readonly deckList = signal<Deck[]>([]);
  protected readonly myLists = signal<CharacterList[]>([]);

  protected readonly mode = signal<GameMode>('novoice');
  protected readonly source = signal<CharacterSource>('custom');
  protected readonly deckId = signal<string | null>(null);
  protected readonly listId = signal<string | null>(null);
  protected readonly giveUp = signal(5);
  protected readonly turnTimer = signal<TurnTimer>(null);
  protected readonly writingTimer = signal<WritingTimer>(null);

  protected readonly turnTimers: TurnTimer[] = [null, 60, 120, 180];
  protected readonly writingTimers: WritingTimer[] = [null, 30, 60, 90];

  protected readonly missing = computed(() =>
    this.source() === 'deck' && !this.deckId() ? 'Pick a deck.' : this.source() === 'list' && !this.listId() ? 'Pick a list.' : null,
  );

  ngOnInit(): void {
    this.mode.set(this.room.mode);
    this.source.set(this.room.character_source);
    this.deckId.set(this.room.deck_id);
    this.listId.set(this.room.list_id ?? null);
    this.giveUp.set(this.room.give_up_after);
    this.turnTimer.set(this.room.turn_timer_sec);
    this.writingTimer.set(this.room.writing_timer_sec);

    this.decks.getDecks().subscribe({ next: decks => this.deckList.set(decks), error: () => undefined });
    if (this.signedIn()) this.lists.myLists().subscribe({ next: lists => this.myLists.set(lists), error: () => undefined });
  }

  protected stepGiveUp(delta: number): void {
    this.giveUp.update(n => Math.min(99, Math.max(1, n + delta)));
  }

  protected timerLabel(sec: number | null, unit: 'min' | 's'): string {
    if (!sec) return 'Off';
    return unit === 'min' ? `${sec / 60} min` : `${sec} s`;
  }

  protected submit(): void {
    if (this.missing() || this.busy || this.players < 2) return;
    const source = this.source();
    this.playAgain.emit({
      mode: this.mode(),
      character_source: source,
      deck_id: source === 'deck' ? this.deckId() : null,
      list_id: source === 'list' ? this.listId() : null,
      give_up_after: this.giveUp(),
      turn_timer_sec: this.turnTimer(),
      writing_timer_sec: source === 'custom' ? this.writingTimer() : null,
    });
  }
}
