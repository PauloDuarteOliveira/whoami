import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Note, Player } from '../../../core/models';

export interface NoteDraft {
    text: string;
    visible: boolean;
}

@Component({
    selector: 'app-notes',
    imports: [FormsModule, DatePipe],
    templateUrl: './notes.html',
    styleUrl: './notes.css',
})
export class Notes implements OnInit {
    @Input({ required: true }) me!: Player;
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) notes: Note[] = [];

    @Output() save = new EventEmitter<NoteDraft>();

    protected text = '';
    protected visible = true;

    protected readonly tab = signal('me');

    private savedText = '';
    private savedVisible = true;

    ngOnInit(): void {
        const mine = this.notes.find(n => n.player_id === this.me.id);
        if (mine) {
            this.text = mine.text;
            this.visible = mine.visible;
        }
        this.savedText = this.text;
        this.savedVisible = this.visible;
    }

    protected shared(): Note[] {
        return this.notes.filter(n => n.player_id !== this.me.id && n.visible && n.text.trim() !== '');
    }

    protected noteOf(playerId: string): Note | null {
        return this.shared().find(n => n.player_id === playerId) ?? null;
    }

    protected current(): string {
        return this.tab() === 'me' || this.noteOf(this.tab()) ? this.tab() : 'me';
    }

    protected nameOf(playerId: string): string {
        return this.players.find(p => p.id === playerId)?.name ?? 'Someone';
    }

    protected dirty(): boolean {
        return this.text !== this.savedText || this.visible !== this.savedVisible;
    }

    protected saveNow(): void {
        if (!this.dirty()) return;
        this.save.emit({ text: this.text, visible: this.visible });
        this.savedText = this.text;
        this.savedVisible = this.visible;
    }
}
