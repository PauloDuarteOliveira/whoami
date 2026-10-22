import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Answer, Character, Player, Question, Room, Vote } from '../../../core/models';
import { UpperCasePipe } from '@angular/common';

@Component({
    selector: 'app-game',
    imports: [ReactiveFormsModule, UpperCasePipe],
    templateUrl: './game.html',
    styleUrl: './game.css',
})
export class Game {
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

    @Output() ask = new EventEmitter<string>();
    @Output() vote = new EventEmitter<Answer>();
    @Output() endTurn = new EventEmitter<void>();
    @Output() leave = new EventEmitter<void>();

    protected readonly questionText = new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(3), Validators.maxLength(140)],
    });

    protected readonly answers: { value: Answer; label: string }[] = [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];

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

    protected nameOf(playerId: string): string {
        return playerId === this.me.id ? 'You' : (this.players.find(p => p.id === playerId)?.name ?? '?');
    }

    protected characterOf(p: Player): string {
        if (p.id === this.me.id) return 'Hidden';
        return this.characters.find(c => c.assigned_to === p.id)?.name ?? '—';
    }

    protected iCanVote(): boolean {
        return this.voters.some(v => v.id === this.me.id) && !this.votes.some(v => v.voter_id === this.me.id);
    }

    protected countOf(value: string): number {
        return this.votes.filter(v => v.value === value).length;
    }

    protected recent(): Question[] {
        return this.questions.filter(q => q.result !== null && q.kind === 'question').slice(-8).reverse();
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