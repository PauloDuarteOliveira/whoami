import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { CharacterService, sameCharacter } from '../../core/character.service';
import { GameService } from '../../core/game.service';
import { Writing } from './writing/writing';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, concat, map, switchMap, tap } from 'rxjs';
import { DeckService } from '../../core/deck.service';
import { QuestionService, majority, verdict } from '../../core/question.service';
import { Deck, Player, Answer, GuessVerdict, Question, Room } from '../../core/models';
import { PlayerService } from '../../core/player.service';
import { RoomService, RoomSettings } from '../../core/room.service';
import { RoomStore } from '../../core/room-store';
import { SessionService } from '../../core/session.service';
import { Lobby } from './lobby/lobby';
import { Game } from './game/game';
import { Results } from './results/results';
import { AfterGame } from './after-game/after-game';
import { NoteService } from '../../core/note.service';
import { NoteDraft } from './notes/notes';
import { BoardDraft } from './board/board';
import { WhiteboardService } from '../../core/whiteboard.service';
import { ConfirmService } from '../../core/confirm.service';
import { ReportService } from '../../core/report.service';
import { openReport, reportResult, reportVoters, strikes, writerOf } from '../../core/report-rules';
import { DecisionEvent, ReportDialogs, ReportVoteEvent, RewriteEvent } from './report-dialogs/report-dialogs';
import { ChatService } from '../../core/chat.service';
import { ProfileService } from '../../core/profile.service';
import { initials } from '../../shared/initials';
import { avatarUrl, isAvatar } from '../../shared/avatars';

/** Voting on a question and judging a guess get 30 seconds each in rooms with a turn timer; guessing gets at least that. */
const STEP_SECONDS = 30;

/** Where "Back to lobby" is remembered for this tab: the room and game it was pressed in. */
const AFTER_GAME_KEY = 'whoami.afterGame';
function readAfterGame(): string | null {
    try { return sessionStorage.getItem(AFTER_GAME_KEY); } catch { return null; }
}

@Component({
    selector: 'app-room',
    imports: [RouterLink, Lobby, Writing, Game, Results, AfterGame, ReportDialogs],
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
    private readonly chatService = inject(ChatService);
    private readonly profile = inject(ProfileService);

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

    /**
     * The turn timer, one window per step (rooms with a turn timer only). Asking gets the room's time;
     * voting and judging a guess get 30 s each, so slow voters never eat the asker's time. Guessing
     * picks up the asking time that was left, or 30 s if less was left (see guessStep).
     * Every step sets its own start (turn_started_at).
     */
    protected readonly timeTotal = computed(() => {
        const room = this.store.room();
        if (!room || room.status !== 'playing' || !room.turn_timer_sec) return null;
        return room.turn_phase === 'question' || room.turn_phase === 'guess' ? room.turn_timer_sec : STEP_SECONDS;
    });
    /** When this turn's asking started (seen while it was the asking step), to know the time left for the guess. */
    private readonly askStart = signal<{ turn: number; at: number } | null>(null);
    /** When this device first saw the question vote start (the asker's clock stopped there). */
    private readonly voteStart = signal<{ turn: number; at: number } | null>(null);

    /**
     * The guess step: it resumes the asking clock where the question was sent, but never with less than 30 s.
     * Asked in 20 s of 1 min → 40 s to guess; asked in 50 s → 30 s. The bar picks up where it stopped.
     */
    private guessStep(room: Room): Partial<Room> {
        const now = Date.now();
        const total = room.turn_timer_sec;
        const left = this.timeAfterVote(room);
        if (!total || left === null) return { turn_phase: 'guess', turn_started_at: new Date(now).toISOString() };
        // The clock counts down from the room's time, so start it as if (total − left) seconds had already gone.
        return { turn_phase: 'guess', turn_started_at: new Date(now - (total - left) * 1000).toISOString() };
    }

    /** The asker's time waiting for them after the vote: what was left when they asked, at least 30 s. */
    private timeAfterVote(room: Room): number | null {
        const total = room.turn_timer_sec;
        if (!total) return null;
        // Measured on this device's own clock (a phone's clock can be minutes off from the others').
        const ask = this.askStart();
        const vote = this.voteStart();
        const used = ask?.turn === room.turn_number && vote?.turn === room.turn_number ? Math.max(0, vote.at - ask.at) / 1000 : total;
        return Math.round(Math.min(total, Math.max(STEP_SECONDS, total - used)));
    }

    /** During the question vote: the asker's paused time, shown next to the vote's own clock. */
    protected readonly pausedTime = computed(() => {
        const room = this.store.room();
        const question = this.currentQuestion();
        if (!room || room.status !== 'playing' || room.turn_phase !== 'answer_vote' || !question) return null;
        return this.timeAfterVote(room);
    });
    /** Seconds left in this step, or null when the room has no timer. */
    protected readonly timeLeft = computed(() => {
        const room = this.store.room();
        const total = this.timeTotal();
        if (!room || total === null || !room.turn_started_at) return null;
        const used = (this.store.now() - new Date(room.turn_started_at).getTime()) / 1000;
        return Math.max(0, Math.ceil(total - used));
    });
    /** The step whose time already ran out (so it's only handled once). */
    private timedOutStep: string | null = null;

    /** The Admin and Helpers can close a question vote that's stuck. */
    protected readonly canCloseVote = computed(() => {
        const role = this.store.me()?.role;
        return role === 'admin' || role === 'helper';
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
            card: { label: `${player.name}'s character · written by ${writer?.name ?? 'someone'}`, name: character.name, avatar: { letter: initials(player, this.store.players()), color: player.color, image: isAvatar(player.avatar) ? avatarUrl(player.avatar) : null } },
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

    // After a game ----------------------------------------------------------------------------------------

    /** "Back to lobby" on the results, remembered for this game (a reload stays in the lobby). */
    private readonly backInLobby = signal<string | null>(readAfterGame());
    /** The Admin pressed Play again: start the next game once the room is back in the lobby. */
    private startWhenReady = false;

    /** The room's finished game, told apart from the next one in the same room. */
    private gameKey(room: Room): string {
        return `${room.id}@${room.created_at}`;
    }

    /** The lobby after a game: after "Back to lobby", or straight away for someone who joined after the game. */
    protected readonly showAfterGame = computed(() => {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me || room.status !== 'finished') return false;
        return this.backInLobby() === this.gameKey(room) || me.turn_position === null;
    });

    protected backToLobby(): void {
        const room = this.store.room();
        if (!room) return;
        const key = this.gameKey(room);
        this.backInLobby.set(key);
        try { sessionStorage.setItem(AFTER_GAME_KEY, key); } catch { /* private mode: just this visit */ }
    }

    /** The Admin starts the next game in the same room, with the settings they picked. */
    protected playAgain(settings: RoomSettings): void {
        const room = this.store.room();
        if (!room || room.status !== 'finished' || this.store.me()?.role !== 'admin') return;
        this.startWhenReady = true;
        this.run(this.roomService.playAgain(room.id, settings), (e: Error) => {
            this.startWhenReady = false;
            return e.message === 'PLAY_AGAIN_MISSING' ? 'Play again needs migration 010 in Supabase.' : null;
        });
    }

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
            // Everyone else left while writing: back to the lobby (characters cleared), so the Admin can invite more friends.
            if (players.length < 2) {
                this.starting = true;
                this.run(concat(
                    this.characterService.removeAll(room.id),
                    this.roomService.update(room.id, { status: 'lobby', writing_ends_at: null }),
                ));
                this.actionError.set('Everyone else left, so the room went back to the lobby. Invite more friends to play.');
                return;
            }
            const allWritten = players.every(p => characters.some(c => c.written_by === p.id));
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
                        .pipe(switchMap(() => this.roomService.update(room.id, this.guessStep(room)))),
                );
            }
        });

        // A new game in this room (Play again): the one-off flags of the last game start over,
        // and the Admin starts it as soon as everyone is back in the lobby.
        effect(() => {
            const room = this.store.room();
            if (!room || room.status !== 'lobby') return;
            this.ending = false;
            this.starting = false;
            this.skippedTurn = null;
            this.timedOutStep = null;
            if (this.startWhenReady && this.store.me()?.role === 'admin') {
                this.startWhenReady = false;
                untracked(() => this.start());
            }
        });

        // Remembers when this device saw the asking and the vote start, for the time left to guess.
        effect(() => {
            const room = this.store.room();
            if (room?.status !== 'playing') return;
            const turn = room.turn_number;
            if (room.turn_phase === 'question' && untracked(() => this.askStart())?.turn !== turn) this.askStart.set({ turn, at: Date.now() });
            if (room.turn_phase === 'answer_vote' && untracked(() => this.voteStart())?.turn !== turn) this.voteStart.set({ turn, at: Date.now() });
        });

        // Time's up for this step. The player whose turn it is handles it, or the Admin if they're away:
        // asking or guessing → the turn passes on; a vote → it closes with the votes in so far
        // (no votes: Unsure for a question, Wrong for a guess), the same as Close the vote.
        effect(() => {
            const left = this.timeLeft();
            const room = this.store.room();
            const me = this.store.me();
            if (left !== 0 || !room || !me) return;
            const step = `${room.turn_number}:${room.turn_phase}:${room.turn_started_at}`;
            if (this.timedOutStep === step) return;
            const current = this.store.players().find(p => p.id === room.current_player_id);
            const passer = current && this.isOnline(current) ? current.id : this.playing().find(p => p.role === 'admin')?.id;
            if (passer !== me.id) return;
            this.timedOutStep = step;
            untracked(() => {
                const question = this.currentQuestion();
                const guess = this.currentGuess();
                if (room.turn_phase === 'answer_vote' && question && !this.finished.has(question.id)) {
                    this.finished.add(question.id);
                    this.run(this.questionService.setResult(question.id, majority(this.currentVotes()))
                        .pipe(switchMap(() => this.roomService.update(room.id, this.guessStep(room)))));
                } else if (room.turn_phase === 'guess_vote' && guess && guess.result === null) {
                    this.resolveGuess(room, guess, verdict(this.guessVotes()));
                } else if (room.turn_phase === 'question' || room.turn_phase === 'guess') {
                    this.run(this.game.nextTurn(room, this.store.players()));
                }
            });
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
        if (room.character_source === 'list') {
            const players = this.playing().length;
            this.run(this.game.startList(room, this.playing()), (e: Error) =>
                e.message === 'LIST_TOO_SHORT'
                    ? `Your list has fewer characters than the ${players} players. Add more in Your account, or start fewer players.`
                    : e.message === 'LIST_MISSING'
                        ? "This room's character list was deleted. Create a new room with another list."
                        : null,
            );
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
                    return this.roomService.update(room.id, { turn_phase: 'answer_vote', turn_started_at: new Date().toISOString() });
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
                    return this.roomService.update(room.id, { turn_phase: 'guess_vote', turn_started_at: new Date().toISOString() });
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

    /** The Admin or a Helper closes a question vote that's stuck (someone away or not answering): the votes in so far decide it. */
    protected async closeVote(): Promise<void> {
        const room = this.store.room();
        const question = this.currentQuestion();
        if (!room || room.turn_phase !== 'answer_vote' || !question || this.finished.has(question.id) || !this.canCloseVote()) return;
        const count = this.currentVotes().length;
        const yes = await this.confirm.ask({
            tone: 'normal', icon: 'skip', title: 'Close the vote?',
            text: count ? `The ${count} ${count === 1 ? 'vote' : 'votes'} in so far decide the answer.` : 'Nobody voted yet, so the answer is Unsure.',
            confirmLabel: 'Close the vote',
        });
        const now = this.store.room();
        const still = this.currentQuestion();
        if (!yes || !now || now.turn_phase !== 'answer_vote' || still?.id !== question.id || this.finished.has(question.id)) return;
        this.finished.add(question.id);
        this.run(
            this.questionService
                .setResult(question.id, majority(this.currentVotes()))
                .pipe(switchMap(() => this.roomService.update(now.id, this.guessStep(now)))),
        );
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

    /** Sends a chat message; it shows straight away, and again (once) when the live update arrives. */
    protected sendMessage(text: string): void {
        const room = this.store.room();
        const me = this.store.me();
        if (!room || !me) return;
        this.chatService.send(room.id, me.id, text).subscribe({
            next: message => this.store.addMessage(message),
            error: () => this.actionError.set(me.muted ? 'The Admin muted you in the chat.' : 'Could not send your message. Try again.'),
        });
    }

    /** Lobby: you pick another animal (remembered for your next rooms too). */
    protected changeAvatar(avatar: string): void {
        const me = this.store.me();
        if (!me || !isAvatar(avatar)) return;
        this.profile.setAvatar(avatar);
        this.store.patchPlayer(me.id, { avatar });
        this.run(this.playerService.setAvatar(me.id, avatar));
    }

    /** The Admin or a Helper mutes or unmutes someone in the chat. */
    protected async toggleMute(player: Player): Promise<void> {
        if (!player.muted) {
            const yes = await this.confirm.ask({
                tone: 'normal', icon: 'warn', title: `Mute ${player.name} in the chat?`,
                text: `${player.name} can still read the chat and play, but can't write until you unmute them.`,
                confirmLabel: `Mute ${player.name}`,
            });
            if (!yes) return;
        }
        this.store.patchPlayer(player.id, { muted: !player.muted });
        this.run(this.playerService.setMuted(player.id, !player.muted));
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

    /** Runs an action with the busy state; `explain` can turn a known error into a clearer message. */
    private run(action: Observable<unknown>, explain?: (error: Error) => string | null): void {
        this.busy.set(true);
        this.actionError.set(null);
        action.subscribe({
            next: () => this.busy.set(false),
            error: (error: Error) => {
                this.busy.set(false);
                this.actionError.set(explain?.(error) ?? 'That didn\'t work. Check your connection and try again.');
            },
        });
    }
}