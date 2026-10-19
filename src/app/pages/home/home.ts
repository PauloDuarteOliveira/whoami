import { Component, OnInit, inject, signal } from '@angular/core';
import { DeckService } from '../../core/deck.service';
import { Deck } from '../../core/models';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit {
  private readonly deckService = inject(DeckService);

  protected readonly decks = signal<Deck[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.deckService.getDecks().subscribe({
      next: decks => {
        this.decks.set(decks);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not reach the game server.');
        this.loading.set(false);
      },
    });
  }
}