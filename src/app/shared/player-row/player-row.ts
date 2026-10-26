import { UpperCasePipe } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Player } from '../../core/models';
import { PlayerMenu } from '../player-menu/player-menu';

@Component({
    selector: 'app-player-row',
    imports: [UpperCasePipe, PlayerMenu],
    templateUrl: './player-row.html',
    styleUrl: './player-row.css',
})
export class PlayerRow {
    @Input({ required: true }) player!: Player;
    @Input() isMe = false;
    @Input() online = true;
    @Input() canManage = false;
    @Input() canChangeHelpers = false;
    @Input() canHandOver = false;

    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();

    protected roleLabel(): string {
        switch (this.player.role) {
            case 'admin': return 'Admin';
            case 'helper': return 'Helper';
            case 'spectator': return 'Spectator';
            default: return 'Player';
        }
    }
}
