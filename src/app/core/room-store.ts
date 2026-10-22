import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, catchError, forkJoin, map, of, switchMap, timer } from 'rxjs';
import { CharacterService } from './character.service';
import { Character, Player, Question, Room, Vote } from './models';
import { PlayerService } from './player.service';
import { RoomService } from './room.service';
import { SessionService } from './session.service';
import { QuestionService } from './question.service';

const POLL_MS = 2_000;
const HEARTBEAT_MS = 10_000;

export type LoadState = 'loading' | 'ready' | 'missing' | 'error';

@Injectable()
export class RoomStore {
    private readonly rooms = inject(RoomService);
    private readonly playerService = inject(PlayerService);
    private readonly characterService = inject(CharacterService);
    private readonly session = inject(SessionService);
    private readonly questionService = inject(QuestionService);

    readonly room = signal<Room | null>(null);
    readonly players = signal<Player[]>([]);
    readonly characters = signal<Character[]>([]);
    readonly questions = signal<Question[]>([]);
    readonly votes = signal<Vote[]>([]);
    readonly loadState = signal<LoadState>('loading');
    readonly connectionLost = signal(false);
    readonly now = signal(Date.now());

    readonly myId = signal<string | null>(null);
    readonly me = computed(() => this.players().find(p => p.id === this.myId()) ?? null);

    private subscriptions = new Subscription();

    start(code: string): void {
        this.stop();
        this.myId.set(this.session.getPlayerId(code));

        this.subscriptions.add(
            timer(0, POLL_MS)
                .pipe(
                    switchMap(() =>
                        this.rooms.getByCode(code).pipe(
                            switchMap(room =>
                                room
                                    ? forkJoin({
                                        players: this.playerService.getPlayers(room.id),
                                        characters: this.characterService.getCharacters(room.id),
                                        questions: this.questionService.getQuestions(room.id),
                                    }).pipe(
                                        switchMap(data =>
                                            this.questionService
                                                .getVotes(data.questions.filter(q => q.result === null || q.turn_number === room.turn_number).map(q => q.id))
                                                .pipe(map(votes => ({ room, ...data, votes }))),
                                        ),
                                    )
                                    : of({ room: null, players: [] as Player[], characters: [] as Character[], questions: [] as Question[], votes: [] as Vote[] }),
                            ),
                            catchError(() => of('failed' as const)),
                        ),
                    ),
                )
                .subscribe(result => {
                    this.now.set(Date.now());
                    if (result === 'failed') {
                        if (this.loadState() === 'loading') this.loadState.set('error');
                        this.connectionLost.set(true);
                        return;
                    }
                    this.connectionLost.set(false);
                    this.room.set(result.room);
                    this.players.set(result.players);
                    this.characters.set(result.characters);
                    this.questions.set(result.questions);
                    this.votes.set(result.votes);
                    this.loadState.set(result.room ? 'ready' : 'missing');
                }),
        );

        this.subscriptions.add(
            timer(0, HEARTBEAT_MS)
                .pipe(
                    switchMap(() => {
                        const id = this.myId();
                        return id ? this.playerService.heartbeat(id).pipe(catchError(() => of(null))) : of(null);
                    }),
                )
                .subscribe(),
        );
    }

    stop(): void {
        this.subscriptions.unsubscribe();
        this.subscriptions = new Subscription();
    }

    patchPlayer(id: string, changes: Partial<Player>): void {
        this.players.update(list => list.map(p => (p.id === id ? { ...p, ...changes } : p)));
    }

    addCharacter(character: Character): void {
        this.characters.update(list => [...list, character]);
    }

    removeCharacter(id: string): void {
        this.characters.update(list => list.filter(c => c.id !== id));
    }

    addQuestion(question: Question): void {
        this.questions.update(list => [...list, question]);
    }

    addVote(vote: Vote): void {
        this.votes.update(list => [...list, vote]);
    }
}