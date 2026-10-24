import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CharacterService, sameCharacter } from '../../core/character.service';
import { GameService } from '../../core/game.service';
import { Writing } from './writing/writing';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, concat, switchMap } from 'rxjs';
import { DeckService } from '../../core/deck.service';
import { QuestionService, majority, verdict } from '../../core/question.service';
import { Deck, Player, Answer, GuessVerdict, Question, Room } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { RoomService } from '../../core/room.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import { Lobby } from './lobby/lobby';
import { Game } from './game/game';

@Component({
    selector: 'app-room',
    imports: [RouterLink, Lobby, Writing, Game],
    providers: [RoomStore],
    templateUrl: './room.html',
    styleUrl: './room.css',
})

export class RoomPage implements OnInit, OnDestroy {
    protected readonly store = inject(RoomStore);
    private readonly roomService = inject(RoomService);
    private readonly playerService = inject(PlayerService);
    private readonly decks = inject(DeckService);
    private readonly session = inject(SessionService);
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly characterService = inject(CharacterService);
    private readonly game = inject(GameService);
    private readonly questionService = inject(QuestionService);

    protected code = '';
    private readonly deckList = signal<Deck[]>([]);
    protected readonly deckName = computed(() => this.deckList().find(d => d.id === this.store.room()?.deck_id)?.name ?? null);
    protected readonly busy = signal(false);
    protected readonly actionError = signal<string | null>(null);

    protected readonly present = computed(() =>
        this.store.players().filter(p => p.status !== 'kicked' && p.status !== 'left'),
    );

    protected readonly isOnline = (player: Player) => this.playerService.isOnline(player, this.store.now());
    protected readonly playing = computed(() => this.present().filter(p => p.role !== 'spectator'));
    protected readonly inPlay = computed(() =>
        this.store.players().filter(p => p.status === 'playing' && p.role !== 'spectator'),
    );
    private ending = false;
    private skippedTurn: number | null = null;

    protected readonly currentQuestion = computed(() => {
        const room = this.store.room();
        if (!room) return null;
        const asked = this.store.questions().filter(
            q => q.turn_number === room.turn_number && q.player_id === room.current_player_id && q.kind === 'question',
        );
        return asked.at(-1) ?? null;
    });

    protected readonly currentVotes = computed(() => {
        const q = this.currentQuestion();
        return q ? this.store.votes().filter(v => v.question_id === q.id) : [];
    });

    protected readonly voters = computed(() =>
        this.playing().filter(p => p.id !== this.store.room()?.current_player_id && this.isOnline(p)),
    );

    protected readonly currentGuess = computed(() => {
        const room = this.store.room();
        if (!room) return null;
        const guesses = this.store.questions().filter(
            q => q.turn_number === room.turn_number && q.player_id === room.current_player_id && q.kind === 'guess',
        );
        return guesses.at(-1) ?? null;
    });

    protected readonly guessVotes = computed(() => {
        const g = this.currentGuess();
        return g ? this.store.votes().filter(v => v.question_id === g.id) : [];
    });

    protected readonly canOverrule = computed(() => {
        const me = this.store.me();
        return !!me && (me.role === 'admin' || me.role === 'helper') && me.id !== this.store.room()?.current_player_id;
    });

    private readonly finished = new Set<string>();
    protected readonly writeNotice = signal<string | null>(null);
    private starting = false;

    constructor() {
        effect(() => {
            const room = this.store.room();
            const me = this.store.me();
            const players = this.playing();
            const characters = this.store.characters();
            if (!room || room.status !== 'writing' || me?.role !== 'admin' || this.starting) return;
            const allWritten = players.length >= 2 && players.every(p => characters.some(c => c.written_by === p.id));
            if (allWritten) {
                this.starting = true;
                this.run(this.game.startCustom(room, players, characters));
            }
        });

        effect(() => {
            const room = this.store.room();
            const question = this.currentQuestion();
            const votes = this.currentVotes();
            const voters = this.voters();
            if (!room || room.turn_phase !== 'answer_vote' || !question) return;
            if (room.current_player_id !== this.store.me()?.id || this.finished.has(question.id)) return;
            const allVoted = voters.length > 0 && voters.every(v => votes.some(vote => vote.voter_id === v.id));
            if (allVoted) {
                this.finished.add(question.id);
                this.run(
                    this.questionService
                        .setResult(question.id, majority(votes))
                        .pipe(switchMap(() => this.roomService.update(room.id, { turn_phase: 'guess' }))),
                );
            }
        });

        effect(() => {
            const room = this.store.room();
            if (!room || room.status !== 'playing' || this.ending) return;
            if (this.inPlay().length < 2 && this.store.me()?.status === 'playing') {
                this.ending = true;
                this.run(this.roomService.update(room.id, { status: 'finished' }));
            }
        });

        effect(() => {
            const room = this.store.room();
            if (!room || room.status !== 'playing' || this.store.me()?.role !== 'admin') return;
            if (this.inPlay().length < 2 || this.skippedTurn === room.turn_number) return;
            if (!this.inPlay().some(p => p.id === room.current_player_id)) {
                this.skippedTurn = room.turn_number;
                this.run(this.game.nextTurn(room, this.store.players()));
            }
        });

        effect(() => {
            const room = this.store.room();
            const guess = this.currentGuess();
            const votes = this.guessVotes();
            const voters = this.voters();
            if (!room || room.turn_phase !== 'guess_vote' || !guess || guess.result !== null) return;
            if (room.current_player_id !== this.store.me()?.id) return;
            const allVoted = voters.length > 0 && voters.every(v => votes.some(vote => vote.voter_id === v.id));
            if (allVoted) {
                this.resolveGuess(room, guess, verdict(votes));
            }
        });
    }

    ngOnInit(): void {
        this.code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();

        if (!this.session.getPlayerId(this.code)) {
            this.router.navigate(['/join', this.code]);
            return;
        }
        this.store.start(this.code);

        this.decks.getDecks().subscribe({
            next: decks => this.deckList.set(decks),
            error: () => this.deckList.set([]),
        });
    }

    ngOnDestroy(): void {
        this.store.stop();
    }

    protected start(): void {
        const room = this.store.room();
        if (!room) return;

        if (room.character_source === 'deck') {
            this.run(this.game.startDeck(room, this.playing()));
            return;
        }
        const writingEndsAt = room.writing_timer_sec
            ? new Date(Date.now() + room.writing_timer_sec * 1000).toISOString()
            : null;
        this.run(this.roomService.update(room.id, { status: 'writing', writing_ends_at: writingEndsAt }));
    }

    protected write(name: string): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.writeNotice.set(null);

        const duplicate = this.store.characters().find(c => c.written_by !== me.id && sameCharacter(c.name, name));
        if (duplicate) {
            this.store.removeCharacter(duplicate.id);
            this.writeNotice.set(name);
            this.run(this.characterService.remove(duplicate.id));
            return;
        }

        this.busy.set(true);
        this.characterService.write(room.id, me.id, name).subscribe({
            next: character => {
                this.store.addCharacter(character);
                this.busy.set(false);
            },
            error: () => {
                this.busy.set(false);
                this.actionError.set('Could not save your character. Try again.');
            },
        });
    }

    protected startWithout(): void {
        const room = this.store.room();
        if (!room) return;
        const characters = this.store.characters();
        const writers = this.playing().filter(p => characters.some(c => c.written_by === p.id));
        const missing = this.playing().filter(p => !writers.includes(p));
        this.starting = true;
        this.run(
            concat(
                ...missing.map(p => this.playerService.setRole(p.id, 'spectator')),
                this.game.startCustom(room, writers, characters),
            ),
        );
    }

    protected addTime(): void {
        const room = this.store.room();
        if (!room) return;
        this.run(this.roomService.update(room.id, { writing_ends_at: new Date(Date.now() + 30_000).toISOString() }));
    }

    protected ask(text: string): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.run(
            this.questionService.ask(room, me.id, text).pipe(
                switchMap(question => {
                    this.store.addQuestion(question);
                    return this.roomService.update(room.id, { turn_phase: 'answer_vote' });
                }),
            ),
        );
    }

    protected vote(value: Answer): void {
        const question = this.currentQuestion();
        const me = this.store.me();
        if (!question || !me) return;
        this.busy.set(true);
        this.questionService.vote(question.id, me.id, value).subscribe({
            next: vote => {
                this.store.addVote(vote);
                this.busy.set(false);
            },
            error: () => {
                this.busy.set(false);
                this.actionError.set('Could not send your answer. Try again.');
            },
        });
    }

    protected endTurn(): void {
        const room = this.store.room();
        if (!room) return;
        this.run(this.game.nextTurn(room, this.store.players()));
    }

    protected makeGuess(name: string): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.run(
            this.questionService.guess(room, me.id, name).pipe(
                switchMap(guess => {
                    this.store.addQuestion(guess);
                    return this.roomService.update(room.id, { turn_phase: 'guess_vote' });
                }),
            ),
        );
    }

    protected judge(value: GuessVerdict): void {
        const guess = this.currentGuess();
        const me = this.store.me();
        if (!guess || !me) return;
        this.busy.set(true);
        this.questionService.vote(guess.id, me.id, value).subscribe({
            next: vote => {
                this.store.addVote(vote);
                this.busy.set(false);
            },
            error: () => {
                this.busy.set(false);
                this.actionError.set('Could not send your answer. Try again.');
            },
        });
    }

    protected overrule(value: GuessVerdict): void {
        const room = this.store.room();
        const guess = this.currentGuess();
        if (room && guess) this.resolveGuess(room, guess, value);
    }

    protected giveUp(): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        const players = this.store.players().map(p => (p.id === me.id ? { ...p, status: 'gave_up' as const } : p));
        this.run(concat(this.game.nextTurn(room, players), this.game.giveUp(room, me)));
    }

    private resolveGuess(room: Room, guess: Question, result: GuessVerdict): void {
        if (this.finished.has(guess.id)) return;
        this.finished.add(guess.id);
        const players = this.store.players();
        const guesser = players.find(p => p.id === guess.player_id);
        const steps: Observable<unknown>[] = [this.questionService.setResult(guess.id, result)];
        if (result === 'correct' && guesser) {
            steps.push(this.game.finishPlayer(room, guesser, players));
        }
        steps.push(this.game.nextTurn(room, players));
        this.run(concat(...steps));
    }

    protected kick(player: Player): void {
        if (!confirm(`Kick ${player.name} from the room?`)) return;
        this.store.patchPlayer(player.id, { status: 'kicked' });
        this.run(this.playerService.kick(player.id));
    }

    protected toggleHelper(player: Player): void {
        const role = player.role === 'helper' ? 'player' : 'helper';
        this.store.patchPlayer(player.id, { role });
        this.run(this.playerService.setRole(player.id, role));
    }

    protected leave(): void {
        const me = this.store.me();
        const room = this.store.room();
        if (!me || !room) return;
        const inLobby = room.status === 'lobby';

        const others = this.present().filter(p => p.id !== me.id && p.role !== 'spectator');
        const successor = me.role === 'admin' ? (others.find(p => p.role === 'helper') ?? others[0]) : undefined;

        const steps: Observable<unknown>[] = [];
        if (successor) steps.push(this.playerService.setRole(successor.id, 'admin'));
        steps.push(this.playerService.leave(me, inLobby));

        this.busy.set(true);
        concat(...steps).subscribe({
            error: () => {
                this.busy.set(false);
                this.actionError.set('Could not leave the room. Try again.');
            },
            complete: () => this.goHome(),
        });
    }

    protected goHome(): void {
        this.store.stop();
        this.session.forget(this.code);
        this.router.navigate(['/']);
    }

    private run(action: Observable<unknown>): void {
        this.busy.set(true);
        this.actionError.set(null);
        action.subscribe({
            next: () => this.busy.set(false),
            error: () => {
                this.busy.set(false);
                this.actionError.set('That didn\'t work. Check your connection and try again.');
            },
        });
    }
}