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

const PHONE_LAYOUT = '(max-width: 900px), (orientation: landscape) and (max-height: 500px)';

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
    @Input() timeLeft: number | null = null;
    @Input() timeTotal: number | null = null;
    @Input() pausedTime: number | null = null;
    @Input() canCloseVote = false;
    @Input() notes: Note[] = [];
    @Input() boards: Whiteboard[] = [];
    @Input() reportable: string[] = [];
    @Input() spectators: Player[] = [];
    @Input() waitingForCharacter = false;
    @Input() messages: ChatMessage[] = [];
    @Input() everyone: Player[] = [];

    @Output() ask = new EventEmitter<string>();
    @Output() vote = new EventEmitter<Answer>();
    @Output() endTurn = new EventEmitter<void>();
    @Output() voiceGuess = new EventEmitter<void>();
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
    private draftsFor: string | null = null;

    constructor() {
        merge(this.questionText.valueChanges, this.guessText.valueChanges)
            .pipe(takeUntilDestroyed())
            .subscribe(() => {
                if (!this.draftsFor) return;
                try {
                    localStorage.setItem(DRAFT_KEY + this.draftsFor, JSON.stringify({ q: this.questionText.value, g: this.guessText.value }));
                } catch { /* storage blocked */ }
            });
    }

    protected readonly answers: { value: Answer; label: string }[] = [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];

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

    protected visibleTabs(): { value: GamePane; label: string }[] {
        return this.isVoice() ? this.tabs.filter(t => t.value !== 'history') : this.tabs;
    }

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
            } catch { /* storage blocked */ }
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

    protected async passTurn(): Promise<void> {
        const yes = await this.confirm.ask({
            tone: 'normal', icon: 'skip', title: 'Pass your turn?',
            text: 'The turn goes to the next player, and you ask again on your next turn.',
            confirmLabel: 'Pass my turn',
        });
        if (yes && this.isMyTurn() && this.room.turn_phase === 'question') this.endTurn.emit();
    }

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

    protected stepLabel(): string {
        const whose = this.isMyTurn() ? 'Your time' : `${this.currentName()}'s time`;
        switch (this.room.turn_phase) {
            case 'answer_vote': return 'Vote closes in';
            case 'guess_vote': return 'Judging closes in';
            default: return whose;
        }
    }

    protected isVoteStep(): boolean {
        return this.room.turn_phase === 'answer_vote' || this.room.turn_phase === 'guess_vote';
    }

    protected timeLabel(): string {
        return this.clock(this.timeLeft ?? 0);
    }

    protected clock(seconds: number): string {
        return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    }

    protected isVoice(): boolean {
        return this.room.mode === 'voice';
    }

    protected currentCharacter(): string {
        const current = this.players.find(p => p.id === this.room.current_player_id);
        return current ? this.characterOf(current) : '—';
    }

    protected canDraft(): boolean {
        return !this.isVoice() && !this.isMyTurn() && this.me.status === 'playing' && this.me.role !== 'spectator' && this.me.turn_position !== null;
    }

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