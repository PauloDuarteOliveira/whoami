import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Character, Player } from '../../../core/models';
import { PlayerMenu } from '../../../shared/player-menu/player-menu';

type Tone = 'yes' | 'now' | 'off' | '';

/**
 * The Players rail of the Lobby and the Writing phase (design Layout A): the same cards as the game's
 * Players & clues panel, with each player's role and status, and the ⋯ menu (5.1) for the Admin and Helpers.
 */
@Component({
    selector: 'app-roster',
    imports: [PlayerMenu, NgTemplateOutlet],
    templateUrl: './roster.html',
    styleUrl: './roster.css',
})
export class Roster {
    @Input({ required: true }) phase!: 'lobby' | 'writing';
    /** Everyone still in the room, watchers included. */
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) isOnline!: (player: Player) => boolean;
    /** Writing phase: the characters written so far. */
    @Input() characters: Character[] = [];
    /** Writing phase: your character left the pool (someone wrote the same one). */
    @Input() needsNew = false;

    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();

    private rank(p: Player): number {
        if (p.id === this.me.id) return 0;
        return p.role === 'admin' ? 1 : p.role === 'helper' ? 2 : 3;
    }

    /** You first, then the Admin, the Helpers and everyone else. */
    protected playing(): Player[] {
        return this.players.filter(p => p.role !== 'spectator').sort((a, b) => this.rank(a) - this.rank(b));
    }

    protected watching(): Player[] {
        return this.players.filter(p => p.role === 'spectator');
    }

    protected hasWritten(p: Player): boolean {
        return this.characters.some(c => c.written_by === p.id);
    }

    protected doneCount(): number {
        return this.playing().filter(p => this.hasWritten(p)).length;
    }

    protected count(): string {
        const playing = this.playing().length;
        if (this.phase === 'writing') return `${this.doneCount()} of ${playing} done`;
        return `${playing} ${playing === 1 ? 'player' : 'players'}`;
    }

    /** The status after the role: ready, offline, Submitted ✓, Writing… */
    protected state(p: Player): { text: string; tone: Tone } {
        const online = this.isOnline(p);
        if (p.role === 'spectator') return online ? { text: 'watching', tone: '' } : { text: 'offline', tone: 'off' };
        if (this.phase === 'lobby') {
            if (!online) return { text: 'offline', tone: 'off' };
            return { text: p.role === 'admin' && p.id === this.me.id ? 'you run the room' : 'ready', tone: '' };
        }
        if (this.hasWritten(p)) return { text: 'Submitted ✓', tone: 'yes' };
        if (p.id === this.me.id && this.needsNew) return { text: 'Needs a new one', tone: 'off' };
        return online ? { text: 'Writing…', tone: 'now' } : { text: 'offline · writing…', tone: 'off' };
    }

    // The ⋯ menu (design 5.1) ----------------------------------------------------------------------------------

    protected canKick(p: Player): boolean {
        return (this.me.role === 'admin' || this.me.role === 'helper') && p.id !== this.me.id && p.role !== 'admin';
    }

    protected canChangeRoles(p: Player): boolean {
        return this.me.role === 'admin' && p.id !== this.me.id && p.role !== 'spectator';
    }

    protected menuContext(p: Player): string {
        const where = this.phase === 'lobby' ? 'In the lobby' : this.hasWritten(p) ? 'Character submitted' : 'Still writing';
        return this.isOnline(p) ? where : `Offline · ${where.toLowerCase()}`;
    }

    protected menuNote(): string {
        if (this.me.role === 'admin') return 'Helpers see the same menu, except Make Helper and Hand over Admin.';
        if (this.me.role === 'helper') return 'Only the Admin can name Helpers or hand over the Admin role.';
        return '';
    }
}
