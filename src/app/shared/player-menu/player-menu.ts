import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { Player } from '../../core/models';

/**
 * The ⋯ menu the Admin and Helpers use on a player, in the lobby and during the game.
 * The parent decides which actions this person may use on this player; the menu only shows those.
 */
@Component({
    selector: 'app-player-menu',
    templateUrl: './player-menu.html',
    styleUrl: './player-menu.css',
})
export class PlayerMenu {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    @Input({ required: true }) player!: Player;
    @Input() canSkip = false;
    @Input() canKick = false;
    @Input() canChangeHelpers = false;
    @Input() canHandOver = false;

    @Output() skip = new EventEmitter<Player>();
    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();

    protected readonly open = signal(false);

    protected hasActions(): boolean {
        return this.canSkip || this.canKick || this.canChangeHelpers || this.canHandOver;
    }

    protected choose(action: EventEmitter<Player>): void {
        this.open.set(false);
        action.emit(this.player);
    }

    /** Closes when you click anywhere else, or press Escape. */
    @HostListener('document:click', ['$event'])
    protected onDocumentClick(event: MouseEvent): void {
        if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
    }

    @HostListener('document:keydown.escape')
    protected onEscape(): void {
        this.open.set(false);
    }
}
