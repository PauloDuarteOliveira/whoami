import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { DeckService } from './deck.service';
import { Character, Player, Room } from './models';
import { RoomService } from './room.service';
import { SupabaseApiService } from './supabase-api.service';

export function shuffle<T>(list: T[]): T[] {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

@Injectable({ providedIn: 'root' })
export class GameService {
    private readonly api = inject(SupabaseApiService);
    private readonly rooms = inject(RoomService);
    private readonly decks = inject(DeckService);


    startCustom(room: Room, writers: Player[], characters: Character[]): Observable<Room> {
        const circle = shuffle(writers);
        const dealing = circle.map((writer, i) => {
            const character = characters.find(c => c.written_by === writer.id)!;
            const receiver = circle[(i + 1) % circle.length];
            return this.api.update<Character>('characters', { id: `eq.${character.id}` }, { assigned_to: receiver.id });
        });
        return forkJoin(dealing).pipe(switchMap(() => this.begin(room, circle)));
    }

    startDeck(room: Room, players: Player[]): Observable<Room> {
        return this.decks.getCards(room.deck_id!).pipe(
            map(cards => shuffle(cards).slice(0, players.length)),
            switchMap(cards =>
                this.api.insert<Character>('characters', players.map((p, i) => ({ room_id: room.id, name: cards[i].name, assigned_to: p.id }))),
            ),
            switchMap(() => this.begin(room, players)),
        );
    }

    private begin(room: Room, players: Player[]): Observable<Room> {
        const order = shuffle(players);
        const positions = order.map((p, i) =>
            this.api.update<Player>('players', { id: `eq.${p.id}` }, { turn_position: i + 1 }),
        );

        return forkJoin(positions).pipe(
            switchMap(() =>
                this.rooms.update(room.id, {
                    status: 'playing',
                    turn_number: 1,
                    current_player_id: order[0].id,
                    turn_phase: 'question',
                    turn_started_at: new Date().toISOString(),
                    writing_ends_at: null,
                }),
            ),
        );

    }

    nextTurn(room: Room, players: Player[]): Observable<Room> {
        const inPlay = players
            .filter(p => p.status === 'playing' && p.turn_position !== null)
            .sort((a, b) => a.turn_position! - b.turn_position!);
        const currentPos = players.find(p => p.id === room.current_player_id)?.turn_position ?? 0;
        const next = inPlay.find(p => p.turn_position! > currentPos) ?? inPlay[0];
        return this.rooms.update(room.id, {
            turn_number: room.turn_number + 1,
            current_player_id: next.id,
            turn_phase: 'question',
            turn_started_at: new Date().toISOString(),
        });
    }
}