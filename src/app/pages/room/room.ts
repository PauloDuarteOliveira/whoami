import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CharacterService, sameCharacter } from '../../core/character.service';
import { GameService } from '../../core/game.service';
import { Writing } from './writing/writing';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, concat, map, switchMap, tap } from 'rxjs';
import { DeckService } from '../../core/deck.service';
import { QuestionService, majority, verdict } from '../../core/question.service';
import { Deck, Player, Answer, GuessVerdict, Question, Room } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { RoomService } from '../../core/room.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import { Lobby } from './lobby/lobby';
import { Game } from './game/game';
import { Results } from './results/results';
import { NoteService } from '../../core/note.service';
import { NoteDraft } from './notes/notes';
import { BoardDraft } from './board/board';
import { WhiteboardService } from '../../core/whiteboard.service';
import { ConfirmService } from '../../core/confirm.service';
import { ReportService } from '../../core/report.service';
import { openReport, reportResult, reportVoters, strikes, writerOf } from '../../core/report-rules';
import { DecisionEvent, ReportDialogs, ReportVoteEvent, RewriteEvent } from './report-dialogs/report-dialogs';

@Component({
    selector: 'app-room',
    imports: [RouterLink, Lobby, Writing, Game, Results, ReportDialogs],
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
    private readonly noteService = inject(NoteService);
    private readonly whiteboardService = inject(WhiteboardService);
    private readonly confirm = inject(ConfirmService);
    private readonly reportService = inject(ReportService);

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

    // Troll characters (game design, section 4) -------------------------------------------------------------

    private characterOf(playerId: string) {
        return this.store.characters().find(c => c.assigned_to === playerId) ?? null;
    }

    /**
     * Players whose character I may report: written by another player (not a deck card), not by me,
     * not already being dealt with, and not one the room already voted to keep.
     */
    protected readonly reportable = computed(() => {
        const me = this.store.me();
        if (!me || me.role === 'spectator') return [];
        const reports = this.store.reports();
        return this.playing()
            .filter(p => p.id !== me.id)
            .filter(p => {
                const character = this.characterOf(p.id);
                return !!character && !!character.written_by && character.written_by !== me.id
                    && !openReport(reports, character.id)
                    && !reports.some(r => r.character_id === character.id && r.status === 'kept' && r.character_name === character.name);
            })
            .map(p => p.id);
    });

    /** My character is being rewritten, so my turn waits. */
    protected readonly waitingForCharacter = computed(() => {
        const me = this.store.me();
        return !!me && this.store.reports().some(r => r.receiver_id === me.id && r.status === 'replaced');
    });

    private readonly resolvedReports = new Set<string>();

    protected async report(player: Player): Promise<void> {
        const me = this.store.me();
        const character = this.characterOf(player.id);
        if (!me || !character) return;
        const writer = this.store.players().find(p => p.id === character.written_by);
        const yes = await this.confirm.ask({
            tone: 'warn', icon: 'flag', title: `Report ${player.name}'s character?`,
            text: `Use this for a character that's offensive, or a joke nobody could guess. The room votes, and ${player.name} never sees it.`,
            card: { label: `${player.name}'s character · written by ${writer?.name ?? 'someone'}`, name: character.name, avatar: { letter: player.name.charAt(0), color: player.color } },
            note: 'Everyone sees who reported it. If most players say it\'s fine, the character stays.',
            confirmLabel: 'Report it',
        });
        if (!yes) return;
        // Reporting counts as your vote to replace it.
        this.run(
            this.reportService.create(character, me.id).pipe(
                tap(report => this.store.putReport(report)),
                switchMap(report => this.reportService.vote(report, me.id, 'replace')),
                tap(vote => this.store.addReportVote(vote)),
            ),
        );
    }

    protected voteReport(event: ReportVoteEvent): void {
        const me = this.store.me();
        if (!me) return;
        this.run(this.reportService.vote(event.report, me.id, event.value).pipe(tap(vote => this.store.addReportVote(vote))));
    }

    protected rewriteCharacter(event: RewriteEvent): void {
        this.run(
            concat(
                this.reportService.rename(event.report.character_id, event.name).pipe(
                    map(character => {
                        if (!character) throw new Error('Not allowed to rename this character');
                        this.store.patchCharacter(character.id, { name: character.name });
                        return character;
                    }),
                ),
                this.reportService.update(event.report, 'replaced', { status: 'rewritten' }).pipe(
                    tap(report => report && this.store.putReport(report)),
                ),
            ),
        );
    }

    /** Second strike: give the writer one more chance, or kick them and let a random player write it. */
    protected decideReport(event: DecisionEvent): void {
        const report = event.report;
        if (event.choice === 'chance') {
            this.run(this.reportService.setDecision(report, 'chance').pipe(tap(r => r && this.store.putReport(r))));
            return;
        }
        const writerId = writerOf(report, this.store.characters());
        const writer = this.store.players().find(p => p.id === writerId);
        const candidates = this.playing().filter(p => p.id !== report.receiver_id && p.id !== writerId);
        const online = candidates.filter(p => this.isOnline(p));
        const pool = online.length ? online : candidates;
        const next = pool[Math.floor(Math.random() * pool.length)];
        if (!next) return;
        this.run(
            concat(
                this.reportService.setWriter(report.character_id, next.id),
                this.reportService.setDecision(report, 'kicked').pipe(tap(r => r && this.store.putReport(r))),
            ),
        );
        this.store.patchCharacter(report.character_id, { written_by: next.id });
        if (writer) this.removePlayer(writer);
    }

    private readonly finished = new Set<string>();
    protected readonly writeNotice = signal<string | null>(null);
    private starting = false;

    constructor() {
        // Records a report's result once the votes decide it. The reporter's device does it,
        // or the Admin's if the reporter is offline; the status check makes a second write do nothing.
        effect(() => {
            const me = this.store.me();
            const reports = this.store.reports();
            const votes = this.store.reportVotes();
            const players = this.present();
            const characters = this.store.characters();
            if (!me) return;
            for (const report of reports) {
                if (report.status !== 'voting' || this.resolvedReports.has(report.id)) continue;
                const reporter = players.find(p => p.id === report.reporter_id);
                const resolver = reporter && this.isOnline(reporter) ? reporter.id : players.find(p => p.role === 'admin')?.id;
                if (resolver !== me.id) continue;
                const result = reportResult(report, reportVoters(report, players, characters, votes, this.isOnline), votes);
                if (!result) continue;
                this.resolvedReports.add(report.id);
                const changes = result === 'kept'
                    ? { status: 'kept' as const }
                    : { status: 'replaced' as const, admin_decision: strikes(reports, report.writer_id, report) >= 2 ? 'pending' as const : null };
                this.run(this.reportService.update(report, 'voting', changes).pipe(tap(r => r && this.store.putReport(r))));
            }
        });

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
        // roomSessionGuard already checked that this tab joined the room.
        this.code = (this.route.snapshot.paramMap.get('code') ?? '').toUpperCase();
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

    /** Saves quietly in the background (no busy state), so typing never blocks the game buttons. */
    protected saveNote(draft: NoteDraft): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.noteService.save(room.id, me.id, draft.text, draft.visible).subscribe({
            next: note => this.store.putNote(note),
            error: () => this.actionError.set('Could not save your notes. Try again.'),
        });
    }

    /** Like notes, the board saves in the background while you keep drawing. */
    protected saveBoard(draft: BoardDraft): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.whiteboardService.save(room.id, me.id, draft.image, draft.shared).subscribe({
            next: board => this.store.putBoard(board),
            error: () => this.actionError.set('Could not save your board. Try again.'),
        });
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

    protected async kick(player: Player): Promise<void> {
        const yes = await this.confirm.ask({
            tone: 'danger', icon: 'kick', title: `Kick ${player.name} from the room?`,
            text: `${player.name} leaves the game straight away. If it's their turn, it passes to the next player.`,
            confirmLabel: `Kick ${player.name}`,
        });
        if (yes) this.removePlayer(player);
    }

    /** Kicks without asking (the caller already asked). */
    private removePlayer(player: Player): void {
        const room = this.store.room();
        const steps: Observable<unknown>[] = [];
        // Kicking the player whose turn it is: pass the turn first, so nobody waits for someone who's gone.
        if (room?.status === 'playing' && room.current_player_id === player.id) {
            const players = this.store.players().map(p => (p.id === player.id ? { ...p, status: 'kicked' as const } : p));
            if (players.filter(p => p.status === 'playing' && p.role !== 'spectator').length >= 2) {
                steps.push(this.game.nextTurn(room, players));
            }
        }
        steps.push(this.playerService.kick(player.id));
        this.store.patchPlayer(player.id, { status: 'kicked' });
        this.run(concat(...steps));
    }

    /** The Admin or a Helper passes the turn of a player who's away or stuck. */
    protected async skipTurn(): Promise<void> {
        const room = this.store.room();
        if (!room || room.status !== 'playing') return;
        const current = this.store.players().find(p => p.id === room.current_player_id);
        const name = current?.name ?? 'this player';
        const queue = this.inPlay().filter(p => p.turn_position !== null).sort((a, b) => a.turn_position! - b.turn_position!);
        const next = queue.find(p => p.turn_position! > (current?.turn_position ?? 0)) ?? queue[0];
        const away = current && !this.isOnline(current) ? `${name} is offline. ` : '';
        const yes = await this.confirm.ask({
            tone: 'normal', icon: 'skip', title: `Skip ${name}'s turn?`,
            text: `${away}The turn passes to ${next && next.id !== current?.id ? next.name : 'the next player'}, and ${name} keeps their place in the queue.`,
            confirmLabel: 'Skip turn',
        });
        // The turn may have moved on while the box was open: only skip the turn that was asked about.
        const now = this.store.room();
        if (yes && now && now.turn_number === room.turn_number) this.run(this.game.nextTurn(now, this.store.players()));
    }

    /** The Admin makes someone else Admin and becomes a Helper, so they can still help run the room. */
    protected async handOver(player: Player): Promise<void> {
        const me = this.store.me();
        if (!me || me.role !== 'admin') return;
        const yes = await this.confirm.ask({
            tone: 'normal', icon: 'crown', title: `Make ${player.name} the Admin?`,
            text: `${player.name} gets every Admin power. You become a Helper, so you can still skip turns and kick players.`,
            confirmLabel: `Make ${player.name} Admin`,
        });
        if (!yes) return;
        this.store.patchPlayer(player.id, { role: 'admin' });
        this.store.patchPlayer(me.id, { role: 'helper' });
        this.run(concat(this.playerService.setRole(player.id, 'admin'), this.playerService.setRole(me.id, 'helper')));
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