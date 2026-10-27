import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, switchMap, throwError } from 'rxjs';
import { DeckService } from './deck.service';
import { ListService } from './list.service';
import { Character, Player, Question, RankedPlayer, Room } from './models';
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

export function rankPlayers(players: Player[], characters: Character[], questions: Question[]): RankedPlayer[] {
    const asked = (p: Player) => questions.filter(q => q.kind === 'question' && q.player_id === p.id).length;
    const inGame = players.filter(p => p.turn_position !== null);
    const guessed = inGame.filter(p => p.status === 'finished').sort((a, b) => a.finish_place! - b.finish_place!);
    const gaveUp = inGame.filter(p => p.status === 'gave_up').sort((a, b) => asked(b) - asked(a));
    const last = inGame.filter(p => p.status === 'playing');

    return [...guessed, ...gaveUp, ...last].map((p, i) => ({
        place: i + 1,
        player: p,
        character: characters.find(c => c.assigned_to === p.id)?.name ?? '—',
        outcome: p.status === 'finished' ? 'guessed' : p.status === 'gave_up' ? 'gave_up' : 'last',
        questionsAsked: asked(p),
        guesses: questions.filter(q => q.kind === 'guess' && q.player_id === p.id && q.result !== null),
    }));
}

@Injectable({ providedIn: 'root' })
export class GameService {
    private readonly api = inject(SupabaseApiService);
    private readonly rooms = inject(RoomService);
    private readonly decks = inject(DeckService);
    private readonly lists = inject(ListService);


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
            switchMap(cards => this.deal(room, players, cards.map(c => c.name))),
        );
    }

    /** Starts with characters from the host's own list (only the host can read it, and only the host starts). */
    startList(room: Room, players: Player[]): Observable<Room> {
        return this.lists.get(room.list_id!).pipe(
            switchMap(list => {
                if (!list) return throwError(() => new Error('LIST_MISSING'));
                if (list.characters.length < players.length) return throwError(() => new Error('LIST_TOO_SHORT'));
                return this.deal(room, players, list.characters);
            }),
        );
    }

    /** Shuffles the names, gives each player one, then starts the first turn. */
    private deal(room: Room, players: Player[], names: string[]): Observable<Room> {
        const picked = shuffle(names).slice(0, players.length);
        return this.api
            .insert<Character>('characters', players.map((p, i) => ({ room_id: room.id, name: picked[i], assigned_to: p.id })))
            .pipe(switchMap(() => this.begin(room, players)));
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

    finishPlayer(room: Room, player: Player, players: Player[]): Observable<unknown> {
        const place = players.filter(p => p.status === 'finished').length + 1;
        return this.api.update<Player>('players', { id: `eq.${player.id}` }, {
            status: 'finished',
            finish_place: place,
            finish_turn: room.turn_number,
        });
    }

    giveUp(room: Room, player: Player): Observable<unknown> {
        return this.api.update<Player>('players', { id: `eq.${player.id}` }, {
            status: 'gave_up',
            finish_turn: room.turn_number,
        });
    }
}