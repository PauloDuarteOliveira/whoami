import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Answer, Character, GuessVerdict, Note, Player, Question, Room, Vote } from '../../../core/models';
import { NgTemplateOutlet, UpperCasePipe } from '@angular/common';
import { characterNameValidators } from '../../../shared/validators';
import { placeLabel } from '../../../shared/format';
import { ClueBoard } from '../clue-board/clue-board';
import { NoteDraft, Notes } from '../notes/notes';
import { History } from '../history/history';
import { PreferencesService } from '../../../core/preferences.service';
import { SkySwitch } from '../../../shared/sky-switch/sky-switch';

type GamePane = 'play' | 'clues' | 'history' | 'notes';

@Component({
    selector: 'app-game',
    imports: [ReactiveFormsModule, UpperCasePipe, NgTemplateOutlet, ClueBoard, Notes, History, SkySwitch],
    templateUrl: './game.html',
    styleUrl: './game.css',
})
export class Game {
    protected readonly prefs = inject(PreferencesService);

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
    @Input() notes: Note[] = [];

    @Output() ask = new EventEmitter<string>();
    @Output() vote = new EventEmitter<Answer>();
    @Output() endTurn = new EventEmitter<void>();
    @Output() leave = new EventEmitter<void>();
    @Output() makeGuess = new EventEmitter<string>();
    @Output() judge = new EventEmitter<GuessVerdict>();
    @Output() overrule = new EventEmitter<GuessVerdict>();
    @Output() giveUp = new EventEmitter<void>();
    @Output() saveNote = new EventEmitter<NoteDraft>();

    protected readonly questionText = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3), Validators.maxLength(140)],
    });

    protected readonly guessText = new FormControl('', { nonNullable: true, validators: characterNameValidators });

    protected readonly answers: { value: Answer; label: string }[] = [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];

    /**
     * What smaller screens show (see game.css): on a tablet, 'notes' and 'history' open a drawer;
     * on a phone (and a tablet held upright) the bottom tab bar switches between all four.
     * Panes that aren't shown are only hidden, so unsaved notes survive a switch.
     */
    protected readonly pane = signal<GamePane>('play');
    protected readonly tabs: { value: GamePane; label: string }[] = [
        { value: 'play', label: 'Play' },
        { value: 'clues', label: 'Clues' },
        { value: 'history', label: 'History' },
        { value: 'notes', label: 'Notes' },
    ];

    /** The players sheet that slides up on a phone when the avatars are tapped. */
    protected readonly playersOpen = signal(false);

    /** Tablet header buttons: open a tool in the drawer, or close it when it's already open. */
    protected toggleTool(tool: 'notes' | 'history'): void {
        this.pane.update(open => (open === tool ? 'play' : tool));
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

    protected isMyTurn(): boolean {
        return this.room.current_player_id === this.me.id;
    }

    protected currentName(): string {
        const current = this.players.find(p => p.id === this.room.current_player_id);
        return current ? (current.id === this.me.id ? 'You' : current.name) : 'Someone';
    }

    protected characterOf(p: Player): string {
        if (p.id === this.me.id && p.status === 'playing') return 'Hidden';
        return this.characters.find(c => c.assigned_to === p.id)?.name ?? '—';
    }

    /**
     * With Hide names on, other players' characters aren't shown at all (not even blurred,
     * because a blurred word still gives away its length). Your own row isn't affected.
     */
    protected namesHidden(p: Player): boolean {
        return this.prefs.hideNames() && p.id !== this.me.id;
    }

    protected placeLabel(place: number | null): string {
        return placeLabel(place);
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

    protected myQuestionCount(): number {
        return this.questions.filter(q => q.kind === 'question' && q.player_id === this.me.id).length;
    }

    protected canGiveUp(): boolean {
        return this.myQuestionCount() >= this.room.give_up_after;
    }

    protected confirmGiveUp(): void {
        if (confirm('Give up? Your character is revealed and you leave the turn queue. You keep answering for the others.')) {
            this.giveUp.emit();
        }
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