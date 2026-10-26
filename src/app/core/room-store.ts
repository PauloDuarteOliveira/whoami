import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, Subscription, catchError, debounceTime, filter, forkJoin, map, merge, of, switchMap, timer } from 'rxjs';
import { CharacterService } from './character.service';
import { Character, Note, Player, Question, Room, Vote } from './models';
import { NoteService } from './note.service';
import { PlayerService } from './player.service';
import { RealtimeService } from './realtime.service';
import { RoomService } from './room.service';
import { SessionService } from './session.service';
import { QuestionService } from './question.service';

/** Without a live connection the room is reloaded every 2 s; with one, only as a backup every 8 × 2 s = 16 s. */
const POLL_MS = 2_000;
const LIVE_POLL_EVERY = 8;
/** Live changes that arrive close together (a vote and the room update after it) cause a single reload. */
const CHANGES_DEBOUNCE_MS = 100;
const CLOCK_MS = 1_000;
const HEARTBEAT_MS = 10_000;

export type LoadState = 'loading' | 'ready' | 'missing' | 'error';

@Injectable()
export class RoomStore {
    private readonly rooms = inject(RoomService);
    private readonly playerService = inject(PlayerService);
    private readonly characterService = inject(CharacterService);
    private readonly session = inject(SessionService);
    private readonly questionService = inject(QuestionService);
    private readonly noteService = inject(NoteService);
    private readonly realtime = inject(RealtimeService);

    readonly room = signal<Room | null>(null);
    readonly players = signal<Player[]>([]);
    readonly characters = signal<Character[]>([]);
    readonly questions = signal<Question[]>([]);
    readonly votes = signal<Vote[]>([]);
    readonly notes = signal<Note[]>([]);
    readonly loadState = signal<LoadState>('loading');
    readonly connectionLost = signal(false);
    /** True while Supabase Realtime is connected for this room. */
    readonly live = signal(false);
    readonly now = signal(Date.now());

    readonly myId = signal<string | null>(null);
    readonly me = computed(() => this.players().find(p => p.id === this.myId()) ?? null);

    private subscriptions = new Subscription();
    private readonly changes = new Subject<void>();
    private stopWatching: (() => void) | null = null;

    start(code: string): void {
        this.stop();
        this.myId.set(this.session.getPlayerId(code));

        // Reload when Realtime says something changed, plus a timer: every tick while offline, a backup when live.
        const pollTicks = timer(0, POLL_MS).pipe(filter(tick => !this.live() || tick % LIVE_POLL_EVERY === 0));
        const liveChanges = this.changes.pipe(debounceTime(CHANGES_DEBOUNCE_MS));

        this.subscriptions.add(
            merge(pollTicks, liveChanges)
                .pipe(
                    switchMap(() =>
                        this.rooms.getByCode(code).pipe(
                            switchMap(room =>
                                room
                                    ? forkJoin({
                                        players: this.playerService.getPlayers(room.id),
                                        characters: this.characterService.getCharacters(room.id),
                                        questions: this.questionService.getQuestions(room.id),
                                        notes: this.noteService.getNotes(room.id),
                                    }).pipe(
                                        switchMap(data =>
                                            this.questionService
                                                .getVotes(data.questions.filter(q => q.result === null || q.turn_number === room.turn_number).map(q => q.id))
                                                .pipe(map(votes => ({ room, ...data, votes }))),
                                        ),
                                    )
                                    : of({ room: null, players: [] as Player[], characters: [] as Character[], questions: [] as Question[], notes: [] as Note[], votes: [] as Vote[] }),
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
                    this.notes.set(result.notes);
                    this.loadState.set(result.room ? 'ready' : 'missing');
                    if (result.room && !this.stopWatching) this.watch(result.room.id);
                }),
        );

        // Keeps "now" ticking for timers and online dots, now that reloads aren't every 2 seconds.
        this.subscriptions.add(timer(0, CLOCK_MS).subscribe(() => this.now.set(Date.now())));

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
        this.stopWatching?.();
        this.stopWatching = null;
    }

    private watch(roomId: string): void {
        this.stopWatching = this.realtime.watchRoom(roomId, {
            changed: () => this.changes.next(),
            player: player => this.putPlayer(player),
            live: connected => this.live.set(connected),
        });
    }

    /** Applies a player row pushed by Realtime (adds it if it's new). */
    private putPlayer(player: Player): void {
        this.players.update(list =>
            list.some(p => p.id === player.id) ? list.map(p => (p.id === player.id ? player : p)) : [...list, player],
        );
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

    putNote(note: Note): void {
        this.notes.update(list => [...list.filter(n => n.player_id !== note.player_id), note]);
    }
}