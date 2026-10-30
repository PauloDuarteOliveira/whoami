import { DatePipe } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CHAT_MAX_LENGTH } from '../../../core/chat.service';
import { ChatMessage, Player } from '../../../core/models';
import { AvatarFace } from '../../../shared/avatar-face';

@Component({
    selector: 'app-chat',
    imports: [ReactiveFormsModule, DatePipe, AvatarFace],
    templateUrl: './chat.html',
    styleUrl: './chat.css',
})
export class Chat implements OnChanges {
    @Input({ required: true }) messages: ChatMessage[] = [];
    @Input({ required: true }) players: Player[] = [];
    @Input({ required: true }) me!: Player;
    @Input() busy = false;

    @Output() send = new EventEmitter<string>();

    protected readonly maxLength = CHAT_MAX_LENGTH;
    protected readonly text = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(CHAT_MAX_LENGTH)] });
    private readonly list = viewChild<ElementRef<HTMLElement>>('list');

    ngOnChanges(changes: SimpleChanges): void {
        if (!changes['messages']) return;
        const before = changes['messages'].previousValue as ChatMessage[] | undefined;
        const last = this.messages[this.messages.length - 1];
        const mine = last?.player_id === this.me?.id;
        const el = this.list()?.nativeElement;
        const atBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 60;
        if (!before?.length || atBottom || mine) setTimeout(() => this.scrollToEnd());
    }

    protected author(m: ChatMessage): Player | undefined {
        return this.players.find(p => p.id === m.player_id);
    }

    protected submit(): void {
        const value = this.text.value.trim();
        if (!value || this.text.invalid || this.busy || this.me.muted) return;
        this.send.emit(value);
        this.text.reset('');
    }

    private scrollToEnd(): void {
        const el = this.list()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
    }
}
