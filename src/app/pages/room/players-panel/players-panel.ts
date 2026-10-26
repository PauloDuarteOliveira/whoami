import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Answer, Character, ClueGroup, Player, Question, Room } from '../../../core/models';
import { PreferencesService } from '../../../core/preferences.service';
import { clueGroups } from '../../../core/question.service';
import { PlayerMenu } from '../../../shared/player-menu/player-menu';
import { placeLabel } from '../../../shared/format';

type Filter = Answer | 'all';

/**
 * Players & clues (design Layout A): one card per player with their character, role, status and
 * Yes / No / Unsure counts; a card opens to show that player's clues. It replaces the old sidebar
 * and the clue board. The asking player's card opens by itself when the turn changes.
 */
@Component({
    selector: 'app-players-panel',
    imports: [PlayerMenu, NgTemplateOutlet],
    templateUrl: './players-panel.html',
    styleUrl: './players-panel.css',
})
export class PlayersPanel implements OnChanges {
    protected readonly prefs = inject(PreferencesService);

    @Input({ required: true }) room!: Room;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) characters: Character[] = [];
    @Input({ required: true }) questions: Question[] = [];
    @Input({ required: true }) isOnline!: (player: Player) => boolean;
    /** Players whose character this player may report. */
    @Input() reportable: string[] = [];

    @Output() skip = new EventEmitter<void>();
    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();
    @Output() report = new EventEmitter<Player>();

    protected readonly filter = signal<Filter>('all');
    protected readonly filters: { value: Filter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];
    protected readonly searching = signal(false);
    protected readonly search = signal('');
    /** The cards that are open. */
    protected readonly open = signal<Set<string>>(new Set());
    private shownTurn: string | null = null;

    ngOnChanges(): void {
        // A new turn opens the asking player's card (yours on your turn), so their clues are on screen.
        const turn = `${this.room.turn_number}:${this.room.current_player_id}`;
        if (turn !== this.shownTurn && this.room.current_player_id) {
            this.shownTurn = turn;
            this.open.set(new Set([this.room.current_player_id]));
        }
    }

    // Groups -----------------------------------------------------------------------------------------------------

    private byTurn = (a: Player, b: Player) => (a.turn_position ?? 0) - (b.turn_position ?? 0);

    protected stillPlaying(): Player[] {
        return this.players.filter(p => p.turn_position !== null && p.status === 'playing').sort(this.byTurn);
    }

    protected done(): Player[] {
        return this.players.filter(p => p.turn_position !== null && p.status !== 'playing').sort(this.byTurn);
    }

    // One card ---------------------------------------------------------------------------------------------------

    protected toggle(p: Player): void {
        this.open.update(set => {
            const next = new Set(set);
            if (next.has(p.id)) next.delete(p.id);
            else next.add(p.id);
            return next;
        });
    }

    protected isMine(p: Player): boolean {
        return p.id === this.me.id;
    }

    /** Your own character stays hidden while you play; with Hide names on, the others' are removed. */
    protected characterOf(p: Player): string | null {
        if (this.isMine(p) && p.status === 'playing') return 'Hidden';
        if (this.prefs.hideNames() && !this.isMine(p)) return null;
        return this.characters.find(c => c.assigned_to === p.id)?.name ?? '—';
    }

    protected groups(p: Player): ClueGroup[] {
        return clueGroups(p.id, this.questions);
    }

    protected count(p: Player, answer: Answer): number {
        return this.groups(p).find(g => g.answer === answer)?.items.length ?? 0;
    }

    /** The clues shown in an open card, after the filter and the search. */
    protected shownGroups(p: Player): ClueGroup[] {
        const term = this.search().trim().toLowerCase();
        return this.groups(p)
            .filter(g => this.filter() === 'all' || g.answer === this.filter())
            .map(g => ({ ...g, items: g.items.filter(q => !term || q.text.toLowerCase().includes(term)) }))
            .filter(g => g.items.length > 0);
    }

    protected last(p: Player): { text: string; answer: Answer } | null {
        const answered = this.questions.filter(q => q.player_id === p.id && q.result !== null);
        const q = answered[answered.length - 1];
        if (!q) return null;
        const answer: Answer = q.result === 'correct' ? 'yes' : q.result === 'wrong' ? 'no' : (q.result as Answer);
        return { text: q.kind === 'guess' ? `Guess: ${q.text}` : q.text, answer };
    }

    /** The status after the name: asking now, next, offline, ★ 1st, gave up… */
    protected state(p: Player): { text: string; tone: 'now' | 'done' | 'off' | '' } {
        if (p.status === 'finished') return { text: `★ ${placeLabel(p.finish_place)} · turn ${p.finish_turn ?? '?'}`, tone: 'done' };
        if (p.status === 'gave_up') return { text: 'gave up', tone: '' };
        if (!this.isOnline(p)) return { text: 'offline', tone: 'off' };
        if (p.id === this.room.current_player_id) return { text: 'asking now', tone: 'now' };
        const queue = this.stillPlaying();
        const i = queue.findIndex(x => x.id === this.room.current_player_id);
        if (queue.length > 1 && queue[(i + 1) % queue.length]?.id === p.id) return { text: 'next', tone: '' };
        return { text: 'playing', tone: '' };
    }

    // The ⋯ menu (design 5.1) ----------------------------------------------------------------------------------

    private canManage(): boolean {
        return this.me.role === 'admin' || this.me.role === 'helper';
    }

    protected canSkip(p: Player): boolean {
        return this.canManage() && p.id === this.room.current_player_id && p.id !== this.me.id;
    }

    protected canKick(p: Player): boolean {
        return this.canManage() && p.id !== this.me.id && p.role !== 'admin';
    }

    protected canChangeRoles(p: Player): boolean {
        return this.me.role === 'admin' && p.id !== this.me.id && p.role !== 'spectator';
    }

    /** The line under the name in the menu: what matters for the decision. */
    protected menuContext(p: Player): string {
        const theirTurn = p.id === this.room.current_player_id;
        if (!this.isOnline(p)) return theirTurn ? 'Offline · it\'s their turn' : 'Offline · it\'s not their turn';
        if (p.status === 'finished') return 'Finished · still answers for the others';
        if (p.status === 'gave_up') return 'Gave up · still answers for the others';
        return theirTurn ? 'Asking now' : 'Playing · waiting for their turn';
    }

    protected menuNote(): string {
        if (this.me.role === 'admin') return 'Helpers see the same menu, except Make Helper and Hand over Admin.';
        if (this.me.role === 'helper') return 'Only the Admin can name Helpers or hand over the Admin role.';
        return '';
    }
}
