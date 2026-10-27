import { Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal } from '@angular/core';
import { Player } from '../../core/models';

/**
 * The ⋯ menu the Admin and Helpers use on a player (design 5.1). It floats just outside the panel
 * it belongs to (the closest element marked data-menu-anchor), so a scrolling list never clips it.
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
    /** A line under the name: what matters for the decision ("Offline · it's their turn"). */
    @Input() context = '';
    @Input() contextAlert = false;
    /** A small note at the bottom ("Helpers see the same menu, except…"). */
    @Input() note = '';
    @Input() canSkip = false;
    @Input() canKick = false;
    @Input() canChangeHelpers = false;
    @Input() canHandOver = false;
    @Input() canReport = false;
    /** The Admin and Helpers can mute someone in the chat. */
    @Input() canMute = false;

    @Output() skip = new EventEmitter<Player>();
    @Output() kick = new EventEmitter<Player>();
    @Output() toggleHelper = new EventEmitter<Player>();
    @Output() handOver = new EventEmitter<Player>();
    @Output() report = new EventEmitter<Player>();
    @Output() mute = new EventEmitter<Player>();

    protected readonly open = signal(false);
    protected readonly place = signal({ left: 0, top: 0 });

    protected hasActions(): boolean {
        return this.canSkip || this.canReport || this.canMute || this.canKick || this.canChangeHelpers || this.canHandOver;
    }

    protected toggle(): void {
        this.open.update(o => !o);
        if (this.open()) {
            this.position();
            // Focus the first action once the menu is drawn, for keyboard users.
            setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
        }
    }

    protected choose(action: EventEmitter<Player>): void {
        this.open.set(false);
        action.emit(this.player);
    }

    /** Just past the right edge of the panel, level with the row, and always on screen. */
    private position(): void {
        const button = this.host.nativeElement.querySelector('.more');
        if (!button) return;
        const row = button.getBoundingClientRect();
        const anchor = this.host.nativeElement.closest('[data-menu-anchor]')?.getBoundingClientRect();
        const width = Math.min(300, innerWidth - 24);
        let left = (anchor?.right ?? row.right) + 10;
        if (left + width > innerWidth - 12) left = Math.max(12, row.right - width);
        const height = 380;
        const top = Math.max(12, Math.min(row.top - 8, innerHeight - height - 12));
        this.place.set({ left, top });
    }

    @HostListener('window:resize')
    protected onResize(): void {
        if (this.open()) this.position();
    }

    /** The list it sits in can scroll; the menu follows its row. */
    @HostListener('document:scroll')
    protected onScroll(): void {
        if (this.open()) this.position();
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
