import { UpperCasePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { Player } from '../../core/models';

@Component({
    selector: 'app-player-row',
    imports: [UpperCasePipe],
    templateUrl: './player-row.html',
    styleUrl: './player-row.css',
})
export class PlayerRow {
    @Input({ required: true }) player!: Player;
    @Input() isMe = false;
    @Input() online = true;
    @Input() canManage = false;
    @Input() canChangeHelpers = false;

    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();

    protected readonly menuOpen = signal(false);

    protected roleLabel(): string {
        switch (this.player.role) {
            case 'admin': return 'Admin';
            case 'helper': return 'Helper';
            case 'spectator': return 'Spectator';
            default: return 'Player';
        }
    }

    protected onToggleHelper(): void {
        this.menuOpen.set(false);
        this.toggleHelper.emit(this.player);
    }

    protected onKick(): void {
        this.menuOpen.set(false);
        this.kick.emit(this.player);
    }
}