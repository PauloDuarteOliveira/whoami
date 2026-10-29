import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Answer, Character, ChatMessage, GuessVerdict, Note, Player, Question, Room, Vote, Whiteboard } from '../../../core/models';
import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { characterNameValidators } from '../../../shared/validators';
import { PlayersPanel } from '../players-panel/players-panel';
import { NoteDraft, Notes } from '../notes/notes';
import { History } from '../history/history';
import { Board, BoardDraft } from '../board/board';
import { SoundToggle } from '../../../shared/sound-toggle';
import { PreferencesService } from '../../../core/preferences.service';
import { ConfirmService } from '../../../core/confirm.service';
import { SkySwitch } from '../../../shared/sky-switch/sky-switch';
import { Logo } from '../../../shared/logo/logo';
import { HomeLink } from '../../../shared/home-link';
import { Chat } from '../chat/chat';
import { AvatarFace } from '../../../shared/avatar-face';

type GamePane = 'play' | 'clues' | 'board' | 'history' | 'notes' | 'chat';
type GameTool = 'notes' | 'board' | 'history' | 'chat';
type DockTool = 'notes' | 'history' | 'chat';

/** Phones (upright or sideways) and tablets held upright show one part at a time, with the tab bar. */
const PHONE_LAYOUT = '(max-width: 900px), (orientation: landscape) and (max-height: 500px)';

/** Where your next question and guess are kept, per player (one player per room). */
const DRAFT_KEY = 'whoami.draft.';

@Component({
    selector: 'app-game',
    imports: [SoundToggle, ReactiveFormsModule, UpperCasePipe, NgTemplateOutlet, PlayersPanel, Notes, History, Board, SkySwitch, Logo, Chat, AvatarFace, HomeLink],
    templateUrl: './game.html',
    styleUrl: './game.css',
})
export class Game implements OnChanges {
    protected readonly prefs = inject(PreferencesService);
    private readonly confirm = inject(ConfirmService);

    @Input({ required: true }) room!: Room;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) characters: Character[] = [];
    @Input({ required: true }) questions: Question[] = [];
    @Input() question: Question | null = null;
    @Input() votes: Vote[] = [];
    @Input() voters: Player[] = [];
    @Input({ required: true }) isOnline!: (player: Player) => boolean;
    @Input() busy = false;
    @Input() guess: Question | null = null;
    @Input() guessVotes: Vote[] = [];
    @Input() canOverrule = false;
    /** Seconds left in this turn (null: the room has no turn timer). */
    @Input() timeLeft: number | null = null;
    /** The clock's full length: the room's time to ask and to guess (it resumes), 30 s to vote or judge. */
    @Input() timeTotal: number | null = null;
    /** During the question vote: the asker's time that waits for them (to guess) after the vote. */
    @Input() pausedTime: number | null = null;
    /** The Admin and Helpers can close a stuck question vote. */
    @Input() canCloseVote = false;
    @Input() notes: Note[] = [];
    @Input() boards: Whiteboard[] = [];
    /** Players whose character this player may report as a troll entry. */
    @Input() reportable: string[] = [];
    /** Players who joined during the game: listed as Spectators. */
    @Input() spectators: Player[] = [];
    /** True while this player's character is being rewritten: their turn waits. */
    @Input() waitingForCharacter = false;
    /** The room chat, and everyone who has been in the room (so old messages keep their author). */
    @Input() messages: ChatMessage[] = [];
    @Input() everyone: Player[] = [];

    @Output() ask = new EventEmitter<string>();
    @Output() vote = new EventEmitter<Answer>();
    @Output() endTurn = new EventEmitter<void>();
    /** Voice mode: the guess was said out loud (the others then judge it). */
    @Output() voiceGuess = new EventEmitter<void>();
    /** Voice mode: asked and answered out loud; pass the turn on. */
    @Output() voiceNext = new EventEmitter<void>();
    @Output() leave = new EventEmitter<void>();
    @Output() makeGuess = new EventEmitter<string>();
    @Output() judge = new EventEmitter<GuessVerdict>();
    @Output() overrule = new EventEmitter<GuessVerdict>();
    @Output() closeVote = new EventEmitter<void>();
    @Output() giveUp = new EventEmitter<void>();
    @Output() saveNote = new EventEmitter<NoteDraft>();
    @Output() saveBoard = new EventEmitter<BoardDraft>();
    @Output() skipTurn = new EventEmitter<void>();
    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();
    @Output() report = new EventEmitter<Player>();
    @Output() sendMessage = new EventEmitter<string>();
    @Output() toggleMute = new EventEmitter<Player>();

    protected readonly questionText = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3), Validators.maxLength(140)],
    });

    protected readonly guessText = new FormControl('', { nonNullable: true, validators: characterNameValidators });
    /** The player whose drafts are loaded (the question and guess boxes double as "Your next move"). */
    private draftsFor: string | null = null;

    constructor() {
        // Your next question and guess, typed during the others' turns, are kept for this room (a reload keeps them).
        merge(this.questionText.valueChanges, this.guessText.valueChanges)
            .pipe(takeUntilDestroyed())
            .subscribe(() => {
                if (!this.draftsFor) return;
                try {
                    localStorage.setItem(DRAFT_KEY + this.draftsFor, JSON.stringify({ q: this.questionText.value, g: this.guessText.value }));
                } catch { /* private mode: the drafts last until the page closes */ }
            });
    }

    protected readonly answers: { value: Answer; label: string }[] = [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];

    /**
     * Layout A: the dock on the right shows Notes or History; the Board takes the middle and the dock.
     * Clicking the open tool again closes the dock and the turn gets the whole width. On a laptop the
     * dock starts open; on a tablet it's a drawer that starts closed; on a phone the tab bar switches panes.
     * Panels that aren't shown are only hidden, so unsaved notes and drawings survive a switch.
     */
    protected readonly pane = signal<GamePane>('play');
    protected readonly dock = signal<DockTool>('notes');
    protected readonly dockOpen = signal(window.innerWidth > 1180);
    protected readonly tabs: { value: GamePane; label: string }[] = [
        { value: 'play', label: 'Play' },
        { value: 'clues', label: 'Clues' },
        { value: 'board', label: 'Board' },
        { value: 'history', label: 'History' },
        { value: 'notes', label: 'Notes' },
        { value: 'chat', label: 'Chat' },
    ];

    /** The phone tabs; Voice mode has no History (questions and guesses are only spoken). */
    protected visibleTabs(): { value: GamePane; label: string }[] {
        return this.isVoice() ? this.tabs.filter(t => t.value !== 'history') : this.tabs;
    }

    /** Messages from the others since you last had the chat open (the Lobby's count as read). */
    private readonly chatSeenAt = signal('');
    protected readonly unread = signal(0);

    ngOnChanges(): void {
        if (this.me && this.draftsFor !== this.me.id) {
            this.draftsFor = this.me.id;
            try {
                const saved = JSON.parse(localStorage.getItem(DRAFT_KEY + this.me.id) ?? 'null') as { q?: string; g?: string } | null;
                if (saved) {
                    this.questionText.setValue(saved.q ?? '', { emitEvent: false });
                    this.guessText.setValue(saved.g ?? '', { emitEvent: false });
                }
            } catch { /* nothing saved */ }
        }
        if (!this.chatSeenAt()) this.chatSeenAt.set(this.messages[this.messages.length - 1]?.created_at ?? ' ');
        this.updateUnread();
    }

    protected openPane(pane: GamePane): void {
        this.pane.set(pane);
        this.updateUnread();
    }

    private chatOpen(): boolean {
        if (matchMedia(PHONE_LAYOUT).matches) return this.pane() === 'chat';
        return this.dockOpen() && this.dock() === 'chat' && this.pane() !== 'board';
    }

    private updateUnread(): void {
        if (this.chatOpen()) this.chatSeenAt.set(this.messages[this.messages.length - 1]?.created_at ?? this.chatSeenAt());
        const seen = this.chatSeenAt();
        this.unread.set(this.messages.filter(m => m.player_id !== this.me.id && m.created_at > seen).length);
    }

    /** Header tools: Board opens or closes the board; Notes and History open the dock, or close it if already open. */
    protected toggleTool(tool: GameTool): void {
        if (tool === 'board') {
            this.pane.update(p => (p === 'board' ? 'play' : 'board'));
            return;
        }
        const sameOpen = this.dock() === tool && this.dockOpen() && this.pane() !== 'board';
        this.dock.set(tool);
        this.dockOpen.set(!sameOpen);
        if (this.pane() === 'board') this.pane.set('play');
        this.updateUnread();
    }

    /** Any player can pass their own turn without asking (it only costs them that turn). */
    protected async passTurn(): Promise<void> {
        const yes = await this.confirm.ask({
            tone: 'normal', icon: 'skip', title: 'Pass your turn?',
            text: 'The turn goes to the next player, and you ask again on your next turn.',
            confirmLabel: 'Pass my turn',
        });
        if (yes && this.isMyTurn() && this.room.turn_phase === 'question') this.endTurn.emit();
    }

    /** True when the game is waiting for this player, to flag the Play tab while another tab is open. */
    protected needsMe(): boolean {
        if (this.room.turn_phase === 'answer_vote') return this.iCanVote();
        if (this.room.turn_phase === 'guess_vote') return this.iCanJudge();
        return this.isMyTurn();
    }

    protected ordered(): Player[] {
        return this.players
            .filter(p => p.turn_position !== null)
            .sort((a, b) => a.turn_position! - b.turn_position!);
    }

    /** What the clock is counting right now. */
    protected stepLabel(): string {
        const whose = this.isMyTurn() ? 'Your time' : `${this.currentName()}'s time`;
        switch (this.room.turn_phase) {
            case 'answer_vote': return 'Vote closes in';
            case 'guess_vote': return 'Judging closes in';
            default: return whose;
        }
    }

    /** Voting and judging: everyone's clock (blue), not the asker's. */
    protected isVoteStep(): boolean {
        return this.room.turn_phase === 'answer_vote' || this.room.turn_phase === 'guess_vote';
    }

    /** "1:05" */
    protected timeLabel(): string {
        return this.clock(this.timeLeft ?? 0);
    }

    protected clock(seconds: number): string {
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }

    /** "Your next move": while the others play, you can write your next question and guess. */
    /** Voice mode: everything is spoken; the app tracks the turns and the guesses. */
    protected isVoice(): boolean {
        return this.room.mode === 'voice';
    }

    /** The character of the player whose turn it is (the judges see it while judging a spoken guess). */
    protected currentCharacter(): string {
        const current = this.players.find(p => p.id === this.room.current_player_id);
        return current ? this.characterOf(current) : '—';
    }

    protected canDraft(): boolean {
        return !this.isVoice() && !this.isMyTurn() && this.me.status === 'playing' && this.me.role !== 'spectator' && this.me.turn_position !== null;
    }

    /** You ask next: the draft box says so. */
    protected iAmNext(): boolean {
        const queue = this.players
            .filter(p => p.status === 'playing' && p.turn_position !== null)
            .sort((a, b) => a.turn_position! - b.turn_position!);
        const i = queue.findIndex(p => p.id === this.room.current_player_id);
        return queue.length > 1 && queue[(i + 1) % queue.length]?.id === this.me.id;
    }

    protected isMyTurn(): boolean {
        return this.room.current_player_id === this.me.id;
    }

    protected currentName(): string {
        const current = this.players.find(p => p.id === this.room.current_player_id);
        return current ? (current.id === this.me.id ? 'You' : current.name) : 'Someone';
    }

    protected characterOf(p: Player): string {
        if (p.id === this.me.id && p.status === 'playing') return '???';
        return this.characters.find(c => c.assigned_to === p.id)?.name ?? '—';
    }

    // Managing the room: the Admin and Helpers -------------------------------------------------------

    protected isAdmin(): boolean {
        return this.me.role === 'admin';
    }

    protected canManage(): boolean {
        return this.me.role === 'admin' || this.me.role === 'helper';
    }

    protected iCanJudge(): boolean {
        return this.voters.some(v => v.id === this.me.id) && !this.guessVotes.some(v => v.voter_id === this.me.id);
    }

    protected guessCount(value: GuessVerdict): number {
        return this.guessVotes.filter(v => v.value === value).length;
    }

    protected submitGuess(): void {
        if (this.guessText.invalid || this.busy) {
            this.guessText.markAsTouched();
            return;
        }
        this.makeGuess.emit(this.guessText.value);
        this.guessText.reset('');
    }

    /**
     * The round: which question this is for the player asking now (their own count, not the room's turns).
     * Passed turns don't count.
     */
    protected round(): number {
        const asked = (id: string) => this.questions.filter(q => q.kind === 'question' && q.player_id === id).length;
        const current = this.room.current_player_id;
        const mine = current ? asked(current) + (this.room.turn_phase === 'question' ? 1 : 0) : 1;
        return Math.max(1, mine);
    }

    protected hasVoted(player: Player, votes: Vote[]): boolean {
        return votes.some(v => v.voter_id === player.id);
    }

    protected voteLabel(player: Player, votes: Vote[]): string {
        return player.name + (this.hasVoted(player, votes) ? ' voted' : " hasn't voted yet");
    }

    protected myQuestionCount(): number {
        return this.questions.filter(q => q.kind === 'question' && q.player_id === this.me.id).length;
    }

    protected canGiveUp(): boolean {
        return this.myQuestionCount() >= this.room.give_up_after;
    }

    protected async confirmGiveUp(): Promise<void> {
        const yes = await this.confirm.ask({
            tone: 'danger', icon: 'flag', title: 'Give up?',
            text: 'Your character is revealed and you leave the turn queue. You keep answering for the others.',
            cancelLabel: 'Keep playing', confirmLabel: 'Give up',
        });
        if (yes) this.giveUp.emit();
    }

    protected iCanVote(): boolean {
        return this.voters.some(v => v.id === this.me.id) && !this.votes.some(v => v.voter_id === this.me.id);
    }

    protected countOf(value: string): number {
        return this.votes.filter(v => v.value === value).length;
    }

    protected submitQuestion(): void {
        if (this.questionText.invalid || this.busy) {
            this.questionText.markAsTouched();
            return;
        }
        this.ask.emit(this.questionText.value);
        this.questionText.reset('');
    }
}