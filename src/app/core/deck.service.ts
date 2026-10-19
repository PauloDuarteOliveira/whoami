import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Deck, DeckCard } from './models';
import { SupabaseApiService } from './supabase-api.service';

@Injectable({ providedIn: 'root' })
export class DeckService {
  private readonly api = inject(SupabaseApiService);

  getDecks(): Observable<Deck[]> {
    return this.api.select<Deck>('decks', { order: 'name.asc' });
  }

  getCards(deckId: string): Observable<DeckCard[]> {
    return this.api.select<DeckCard>('deck_cards', { deck_id: `eq.${deckId}` });
  }
}