import { Component, Input, inject, signal } from '@angular/core';
import { QuestionService } from '../../../core/question.service';
import { Player, Question, Vote } from '../../../core/models';
import { AvatarFace } from '../../../shared/avatar-face';
import { placeLabel } from '../../../shared/format';

type HistoryFilter = 'all' | 'questions' | 'guesses' | 'mine';

/** One question or guess in the History: who asked it and "Leo · 2nd question". */
interface Entry {
    q: Question;
    player: Player | null;
    label: string;
}

/** A round: everyone's 1st question, everyone's 2nd… (each player's own count, as on the cards). */
interface RoundGroup {
    round: number;
    items: Entry[];
}

@Component({
    selector: 'app-history',
    imports: [AvatarFace],
    templateUrl: './history.html',
    styleUrl: './history.css',
})
export class History {
    private readonly questionService = inject(QuestionService);

    @Input({ required: true }) questions: Question[] = [];
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    /** "History" in the game; "Last game" in the lobby after it. */
    @Input() heading = 'History';

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

    /** Answered questions and guesses that match the filter, by round, newest first. */
    protected rounds(): RoundGroup[] {
        const list = this.questions
            .filter(q => q.result !== null && this.matches(q))
            .map(q => ({ q, round: this.roundOf(q) }));
        const numbers = [...new Set(list.map(e => e.round))].sort((a, b) => b - a);
        return numbers.map(round => ({
            round,
            items: list
                .filter(e => e.round === round)
                .sort((a, b) => b.q.created_at.localeCompare(a.q.created_at))
                .map(e => this.entry(e.q, e.round)),
        }));
    }

    /** A player's round: how many questions they had asked by then (a guess belongs to the round of its question). */
    private roundOf(q: Question): number {
        const asked = this.questions.filter(x => x.kind === 'question' && x.player_id === q.player_id && x.turn_number <= q.turn_number).length;
        return Math.max(1, asked);
    }

    private entry(q: Question, round: number): Entry {
        const name = this.nameOf(q.player_id);
        return {
            q,
            player: this.players.find(p => p.id === q.player_id) ?? null,
            label: q.kind === 'guess' ? `${name} · guess` : `${name} · ${placeLabel(round)} question`,
        };
    }

    /** "Yes", "Correct"… */
    protected answerLabel(value: string | null): string {
        return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
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
