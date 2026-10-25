import { Component, Input, inject, signal } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { QuestionService } from '../../../core/question.service';
import { Player, Question, Vote } from '../../../core/models';

type HistoryFilter = 'all' | 'questions' | 'guesses' | 'mine';

interface TurnGroup {
    turn: number;
    items: Question[];
}

@Component({
    selector: 'app-history',
    imports: [UpperCasePipe],
    templateUrl: './history.html',
    styleUrl: './history.css',
})
export class History {
    private readonly questionService = inject(QuestionService);

    @Input({ required: true }) questions: Question[] = [];
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;

    protected readonly filter = signal<HistoryFilter>('all');
    protected readonly filters: { value: HistoryFilter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'questions', label: 'Questions' },
        { value: 'guesses', label: 'Guesses' },
        { value: 'mine', label: 'Mine' },
    ];

    /** Questions whose votes are open, and the votes loaded so far (fetched only when opened). */
    protected readonly open = signal<Set<string>>(new Set());
    protected readonly votes = signal<Record<string, Vote[]>>({});
    protected readonly loading = signal<Set<string>>(new Set());
    protected readonly failed = signal<Set<string>>(new Set());

    /** Answered questions and guesses that match the filter, newest turn first. */
    protected turns(): TurnGroup[] {
        const list = this.questions.filter(q => q.result !== null && this.matches(q));
        const turnNumbers = [...new Set(list.map(q => q.turn_number))].sort((a, b) => b - a);
        return turnNumbers.map(turn => ({ turn, items: list.filter(q => q.turn_number === turn) }));
    }

    protected nameOf(playerId: string): string {
        if (playerId === this.me.id) return 'You';
        return this.players.find(p => p.id === playerId)?.name ?? 'Someone';
    }

    protected toggle(question: Question): void {
        const open = new Set(this.open());
        if (open.has(question.id)) {
            open.delete(question.id);
        } else {
            open.add(question.id);
            this.loadVotes(question.id);
        }
        this.open.set(open);
    }

    protected retry(question: Question): void {
        this.loadVotes(question.id);
    }

    private matches(q: Question): boolean {
        switch (this.filter()) {
            case 'questions': return q.kind === 'question';
            case 'guesses': return q.kind === 'guess';
            case 'mine': return q.player_id === this.me.id;
            default: return true;
        }
    }

    /** Loads the votes of one question the first time it's opened (or again after an error). */
    private loadVotes(questionId: string): void {
        if (this.votes()[questionId] || this.loading().has(questionId)) return;
        this.loading.update(set => new Set(set).add(questionId));
        this.failed.update(set => without(set, questionId));

        this.questionService.getVotes([questionId]).subscribe({
            next: votes => {
                this.votes.update(all => ({ ...all, [questionId]: votes }));
                this.loading.update(set => without(set, questionId));
            },
            error: () => {
                this.failed.update(set => new Set(set).add(questionId));
                this.loading.update(set => without(set, questionId));
            },
        });
    }
}

function without(set: Set<string>, value: string): Set<string> {
    const copy = new Set(set);
    copy.delete(value);
    return copy;
}
