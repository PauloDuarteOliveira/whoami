import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject, Subscription, catchError, debounceTime, filter, forkJoin, map, merge, of, switchMap, timer } from 'rxjs';
import { CharacterService } from './character.service';
import { Character, Note, Player, Question, Report, ReportVote, Room, Vote, Whiteboard, WhiteboardInfo } from './models';
import { ReportService } from './report.service';
import { NoteService } from './note.service';
import { PlayerService } from './player.service';
import { RealtimeService } from './realtime.service';
import { RoomService } from './room.service';
import { SessionService } from './session.service';
import { QuestionService } from './question.service';
import { WhiteboardService } from './whiteboard.service';

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
    private readonly whiteboardService = inject(WhiteboardService);
    private readonly reportService = inject(ReportService);

    readonly room = signal<Room | null>(null);
    readonly players = signal<Player[]>([]);
    readonly characters = signal<Character[]>([]);
    readonly questions = signal<Question[]>([]);
    readonly votes = signal<Vote[]>([]);
    readonly notes = signal<Note[]>([]);
    /** Your board and the shared ones, with their pictures. */
    readonly boards = signal<Whiteboard[]>([]);
    /** Reported (troll) characters and their votes. */
    readonly reports = signal<Report[]>([]);
    readonly reportVotes = signal<ReportVote[]>([]);
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
                                        boards: this.whiteboardService.getInfo(room.id),
                                        reports: this.reportService.getReports(room.id),
                                        reportVotes: this.reportService.getVotes(room.id),
                                    }).pipe(
                                        switchMap(data =>
                                            this.questionService
                                                .getVotes(data.questions.filter(q => q.result === null || q.turn_number === room.turn_number).map(q => q.id))
                                                .pipe(map(votes => ({ room, ...data, votes }))),
                                        ),
                                    )
                                    : of({ room: null, players: [] as Player[], characters: [] as Character[], questions: [] as Question[], notes: [] as Note[], boards: [] as WhiteboardInfo[], reports: [] as Report[], reportVotes: [] as ReportVote[], votes: [] as Vote[] }),
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
                    this.syncBoards(result.boards);
                    this.reports.set(result.reports);
                    this.reportVotes.set(result.reportVotes);
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

    putBoard(board: Whiteboard): void {
        this.boards.update(list => [...list.filter(b => b.player_id !== board.player_id), board]);
    }

    putReport(report: Report): void {
        this.reports.update(list => [...list.filter(r => r.id !== report.id), report]);
    }

    addReportVote(vote: ReportVote): void {
        this.reportVotes.update(list => [...list.filter(v => !(v.report_id === vote.report_id && v.voter_id === vote.voter_id)), vote]);
    }

    patchCharacter(id: string, changes: Partial<Character>): void {
        this.characters.update(list => list.map(c => (c.id === id ? { ...c, ...changes } : c)));
    }

    /** Boards whose picture is being downloaded, by player, with the version asked for. */
    private readonly boardDownloads = new Map<string, string>();

    /**
     * Keeps `boards` in step with the room: downloads a board's picture only when it's new or changed,
     * and drops boards that are gone (or no longer shared, since then they aren't returned).
     */
    private syncBoards(infos: WhiteboardInfo[]): void {
        this.boards.update(list => list.filter(b => infos.some(i => i.player_id === b.player_id)));
        for (const info of infos) {
            const known = this.boards().find(b => b.player_id === info.player_id);
            if (known && known.updated_at === info.updated_at && known.shared === info.shared) continue;
            if (this.boardDownloads.get(info.player_id) === info.updated_at) continue;
            this.boardDownloads.set(info.player_id, info.updated_at);
            this.subscriptions.add(
                this.whiteboardService.getBoard(info.player_id).subscribe({
                    next: board => {
                        this.boardDownloads.delete(info.player_id);
                        if (board) this.putBoard(board);
                    },
                    error: () => this.boardDownloads.delete(info.player_id),
                }),
            );
        }
    }
}