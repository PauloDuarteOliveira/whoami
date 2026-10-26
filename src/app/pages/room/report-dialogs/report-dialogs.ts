import { Component, ElementRef, EventEmitter, HostListener, Input, Output, effect, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { sameCharacter } from '../../../core/character.service';
import { Character, Player, Report, ReportVote, ReportVoteValue } from '../../../core/models';
import { reportVoters, writerOf } from '../../../core/report-rules';
import { DialogIcon } from '../../../shared/dialog-icon/dialog-icon';
import { trapFocus } from '../../../shared/focus';
import { characterNameValidators } from '../../../shared/validators';

export interface ReportVoteEvent { report: Report; value: ReportVoteValue; }
export interface RewriteEvent { report: Report; name: string; }
export interface DecisionEvent { report: Report; choice: 'chance' | 'kick'; }

/**
 * The troll-character dialogs (design canvas, section 7), for whoever needs to act now:
 * the Admin or a Helper after a second strike (7.4), the writer who has to rewrite (7.3),
 * a player who hasn't voted yet (7.2), and the receiver, who only learns their character is being replaced (7.5).
 */
@Component({
    selector: 'app-report-dialogs',
    imports: [ReactiveFormsModule, DialogIcon],
    templateUrl: './report-dialogs.html',
    styleUrl: './report-dialogs.css',
})
export class ReportDialogs {
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) characters: Character[] = [];
    @Input({ required: true }) reports: Report[] = [];
    @Input({ required: true }) votes: ReportVote[] = [];
    @Input({ required: true }) isOnline!: (player: Player) => boolean;
    @Input() busy = false;

    @Output() vote = new EventEmitter<ReportVoteEvent>();
    @Output() rewrite = new EventEmitter<RewriteEvent>();
    @Output() decide = new EventEmitter<DecisionEvent>();

    private readonly box = viewChild<ElementRef<HTMLElement>>('box');
    /** Which dialog is open, so focus moves into it once when it appears. */
    private readonly focusedFor = signal<string | null>(null);

    protected readonly newName = new FormControl('', {
        nonNullable: true,
        validators: [...characterNameValidators, Validators.minLength(2), (control => this.notTaken(control.value)) as ValidatorFn],
    });

    constructor() {
        effect(() => {
            const box = this.box()?.nativeElement;
            const key = box?.dataset['key'] ?? null;
            if (box && key !== this.focusedFor()) {
                this.focusedFor.set(key);
                box.querySelector<HTMLElement>('input, [data-first]')?.focus();
            }
        });
    }

    // What this player sees --------------------------------------------------------------------------------

    protected isHost(): boolean {
        return this.me.role === 'admin' || this.me.role === 'helper';
    }

    /** 7.4 · a second strike waiting for the Admin or a Helper. */
    protected decision(): Report | null {
        if (!this.isHost()) return null;
        // Never the writer: a Helper doesn't decide about their own character.
        return this.reports.find(r =>
            r.status === 'replaced' && r.admin_decision === 'pending'
            && r.writer_id !== this.me.id && writerOf(r, this.characters) !== this.me.id,
        ) ?? null;
    }

    /** 7.3 · a replaced character this player has to write again. */
    protected toRewrite(): Report | null {
        return this.reports.find(r => r.status === 'replaced' && r.admin_decision !== 'pending' && writerOf(r, this.characters) === this.me.id) ?? null;
    }

    /** 7.2 · a vote this player can still cast. */
    protected toVote(): Report | null {
        return this.reports.find(r =>
            r.status === 'voting'
            && this.voters(r).some(p => p.id === this.me.id)
            && !this.votes.some(v => v.report_id === r.id && v.voter_id === this.me.id),
        ) ?? null;
    }

    /** 7.5 · the receiver only learns that a new character is on its way. */
    protected beingReplaced(): boolean {
        return this.reports.some(r => r.status === 'replaced' && r.receiver_id === this.me.id);
    }

    // Helpers for the template -------------------------------------------------------------------------------

    protected voters(report: Report): Player[] {
        return reportVoters(report, this.players, this.characters, this.votes, this.isOnline);
    }

    protected voteOf(report: Report, player: Player): ReportVoteValue | null {
        return this.votes.find(v => v.report_id === report.id && v.voter_id === player.id)?.value ?? null;
    }

    protected votedCount(report: Report): number {
        const ids = new Set(this.voters(report).map(p => p.id));
        return this.votes.filter(v => v.report_id === report.id && ids.has(v.voter_id)).length;
    }

    protected nameOf(id: string | null): string {
        if (!id) return 'Someone';
        if (id === this.me.id) return 'You';
        return this.players.find(p => p.id === id)?.name ?? 'Someone';
    }

    protected player(id: string | null): Player | null {
        return this.players.find(p => p.id === id) ?? null;
    }

    /** The original writer, for the second-strike box (they may already be gone). */
    protected writerName(report: Report): string {
        return this.player(report.writer_id)?.name ?? 'The writer';
    }

    protected send(report: Report): void {
        if (this.newName.invalid || this.busy) {
            this.newName.markAsTouched();
            return;
        }
        this.rewrite.emit({ report, name: this.newName.value });
        this.newName.reset('');
    }

    /** The new character can't be the reported one, or one already in the game. */
    private notTaken(value: string): ValidationErrors | null {
        const report = this.toRewrite();
        if (!value || !report) return null;
        const taken = [report.character_name, ...this.characters.filter(c => c.id !== report.character_id).map(c => c.name)];
        return taken.some(name => sameCharacter(name, value)) ? { taken: true } : null;
    }

    @HostListener('document:keydown', ['$event'])
    protected onKey(event: KeyboardEvent): void {
        const box = this.box()?.nativeElement;
        if (box && event.key === 'Tab') trapFocus(box, event);
    }
}
