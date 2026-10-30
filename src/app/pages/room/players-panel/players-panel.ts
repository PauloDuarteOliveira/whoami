import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Answer, Character, ClueGroup, Player, Question, Room } from '../../../core/models';
import { PreferencesService } from '../../../core/preferences.service';
import { clueGroups } from '../../../core/question.service';
import { rankPlayers } from '../../../core/game.service';
import { PlayerMenu } from '../../../shared/player-menu/player-menu';
import { AvatarFace } from '../../../shared/avatar-face';
import { placeLabel, plural } from '../../../shared/format';

type Filter = Answer | 'all';

@Component({
    selector: 'app-players-panel',
    imports: [PlayerMenu, NgTemplateOutlet, AvatarFace],
    templateUrl: './players-panel.html',
    styleUrl: './players-panel.css',
})
export class PlayersPanel {
    protected readonly prefs = inject(PreferencesService);

    @Input({ required: true }) room!: Room;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) characters: Character[] = [];
    @Input({ required: true }) questions: Question[] = [];
    @Input({ required: true }) isOnline!: (player: Player) => boolean;
    @Input() reportable: string[] = [];
    @Input() spectators: Player[] = [];
    @Input() lastGame = false;

    @Output() skip = new EventEmitter<void>();
    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();
    @Output() report = new EventEmitter<Player>();
    @Output() toggleMute = new EventEmitter<Player>();

    protected readonly filter = signal<Filter>('all');
    protected readonly filters: { value: Filter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
        { value: 'unsure', label: 'Unsure' },
    ];
    protected readonly open = signal<Set<string>>(new Set());

    private byTurn = (a: Player, b: Player) => (a.turn_position ?? 0) - (b.turn_position ?? 0);

    protected stillPlaying(): Player[] {
        return this.players.filter(p => p.turn_position !== null && p.status === 'playing').sort(this.byTurn);
    }

    protected done(): Player[] {
        return this.players.filter(p => p.turn_position !== null && p.status !== 'playing').sort(this.byTurn);
    }

    protected ranked(): Player[] {
        return rankPlayers(this.players, this.characters, this.questions).map(r => r.player);
    }

    protected newcomers(): Player[] {
        return this.players.filter(p => p.turn_position === null && p.status !== 'kicked' && p.status !== 'left');
    }

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

    protected characterOf(p: Player): string | null {
        const character = this.characters.find(c => c.assigned_to === p.id)?.name ?? null;
        if (this.lastGame || p.role === 'spectator') return character;
        if (this.isMine(p) && p.status === 'playing') return '???';
        if (this.prefs.hideNames() && !this.isMine(p)) return null;
        return character ?? '—';
    }

    protected verb(p: Player): string {
        const over = this.room.status !== 'playing';
        if (this.isMine(p)) return over ? 'were' : 'are';
        return over ? 'was' : 'is';
    }

    protected groups(p: Player): ClueGroup[] {
        return clueGroups(p.id, this.questions.filter(q => q.kind === 'question'));
    }

    protected questionCount(p: Player): number {
        return this.groups(p).reduce((sum, g) => sum + g.items.length, 0);
    }

    protected guessesOf(p: Player): Question[] {
        return this.questions.filter(q => q.kind === 'guess' && q.player_id === p.id && q.result !== null);
    }

    protected shownGroups(p: Player): ClueGroup[] {
        return this.groups(p).filter(g => this.filter() === 'all' || g.answer === this.filter());
    }

    protected asked(p: Player): number {
        return this.questions.filter(q => q.kind === 'question' && q.player_id === p.id).length;
    }

    protected state(p: Player): { text: string; tone: 'now' | 'done' | 'off' | '' } {
        if (p.role === 'spectator' && !this.lastGame) return this.isOnline(p) ? { text: 'Watching', tone: '' } : { text: 'Offline', tone: 'off' };
        if (p.status === 'finished') return { text: `★ ${placeLabel(p.finish_place)} · ${plural(this.asked(p), 'question')}`, tone: 'done' };
        if (p.status === 'gave_up') return { text: `Gave up · ${plural(this.asked(p), 'question')}`, tone: '' };
        if (this.lastGame) {
            if (p.turn_position === null) return { text: this.isOnline(p) ? 'Plays the next game' : 'Offline', tone: this.isOnline(p) ? '' : 'off' };
            return { text: `Didn't guess · ${plural(this.asked(p), 'question')}`, tone: '' };
        }
        if (!this.isOnline(p)) return { text: 'Offline', tone: 'off' };
        if (p.id === this.room.current_player_id) return { text: 'Asking now', tone: 'now' };
        const queue = this.stillPlaying();
        const i = queue.findIndex(x => x.id === this.room.current_player_id);
        if (queue.length > 1 && queue[(i + 1) % queue.length]?.id === p.id) return { text: 'Next', tone: '' };
        return { text: 'Playing', tone: '' };
    }

    private canManage(): boolean {
        return this.me.role === 'admin' || this.me.role === 'helper';
    }

    protected canSkip(p: Player): boolean {
        return !this.lastGame && this.canManage() && p.id === this.room.current_player_id && p.id !== this.me.id;
    }

    protected canKick(p: Player): boolean {
        return this.canManage() && p.id !== this.me.id && p.role !== 'admin';
    }

    protected canMute(p: Player): boolean {
        return this.canKick(p);
    }

    protected canChangeRoles(p: Player): boolean {
        return this.me.role === 'admin' && p.id !== this.me.id && p.role !== 'spectator';
    }

    protected menuContext(p: Player): string {
        if (this.lastGame) return this.isOnline(p) ? 'In the lobby · plays the next game' : 'Offline';
        if (p.role === 'spectator') return this.isOnline(p) ? 'Spectator · joined during the game, plays the next one' : 'Offline';
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
