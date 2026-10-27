import { DatePipe } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, signal, viewChild } from '@angular/core';
import QRCode from 'qrcode';
import { ChatMessage, Player, Room } from '../../../core/models';
import { SettingsSummary } from '../../../shared/settings-summary/settings-summary';
import { RoomTop } from '../room-top/room-top';
import { Roster } from '../roster/roster';
import { Chat } from '../chat/chat';
import { trapFocus } from '../../../shared/focus';

export const MIN_PLAYERS = 2;

/**
 * The lobby (design Layout A): the Players rail, the code to share (with a QR code of the invite link;
 * on a phone, a Share button and a QR code button that opens it full screen), the settings and Start.
 */
@Component({
  selector: 'app-lobby',
  imports: [DatePipe, RoomTop, Roster, SettingsSummary, Chat],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class Lobby implements OnChanges {
  @Input({ required: true }) room!: Room;
  @Input({ required: true }) players: Player[] = [];
  @Input({ required: true }) me!: Player;
  @Input() deckName: string | null = null;
  @Input() connectionLost = false;
  @Input({ required: true }) isOnline!: (player: Player) => boolean;
  @Input() starting = false;
  /** The room chat, and everyone who has been in the room (so old messages keep their author). */
  @Input() messages: ChatMessage[] = [];
  @Input() everyone: Player[] = [];

  @Output() start = new EventEmitter<void>();
  @Output() leave = new EventEmitter<void>();
  @Output() kick = new EventEmitter<Player>();
  @Output() toggleHelper = new EventEmitter<Player>();
  @Output() handOver = new EventEmitter<Player>();
  @Output() sendMessage = new EventEmitter<string>();
  @Output() toggleMute = new EventEmitter<Player>();
  @Output() changeAvatar = new EventEmitter<string>();

  protected readonly copied = signal<'code' | 'link' | null>(null);
  protected readonly minPlayers = MIN_PLAYERS;
  /** The QR code of the invite link, as an image. */
  protected readonly qr = signal<string | null>(null);
  /** Phones and tablets can hand the link to WhatsApp, Messages… with the system's share sheet. */
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  /** The full-screen QR code (phones). */
  protected readonly qrOpen = signal(false);
  private readonly qrBox = viewChild<ElementRef<HTMLElement>>('qrBox');
  private returnFocus: HTMLElement | null = null;
  private qrFor: string | null = null;

  ngOnChanges(): void {
    if (this.room.code === this.qrFor) return;
    this.qrFor = this.room.code;
    QRCode.toDataURL(this.inviteLink(), { margin: 1, width: 640, color: { dark: '#0A3440', light: '#FFFFFF' } })
      .then(url => this.qr.set(url))
      .catch(() => this.qr.set(null));
  }

  protected openQr(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.qrOpen.set(true);
    // Focus Done once the dialog is on screen, so Enter or Escape closes it.
    setTimeout(() => this.qrBox()?.nativeElement.querySelector<HTMLElement>('.qr-done')?.focus());
  }

  protected closeQr(): void {
    this.qrOpen.set(false);
    this.returnFocus?.focus?.();
    this.returnFocus = null;
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const box = this.qrBox()?.nativeElement;
    if (!this.qrOpen() || !box) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeQr();
    } else if (event.key === 'Tab') {
      trapFocus(box, event);
    }
  }

  protected share(): void {
    navigator.share({ title: 'Join my WhoAmI room', text: `Join my WhoAmI room with the code ${this.room.code}`, url: this.inviteLink() })
      .catch(() => undefined);
  }

  protected get isAdmin(): boolean {
    return this.me.role === 'admin';
  }

  protected get playing(): Player[] {
    return this.players.filter(p => p.role !== 'spectator');
  }

  protected inviteLink(): string {
    return `${location.origin}${location.pathname}#/join/${this.room.code}`;
  }

  protected copy(what: 'code' | 'link'): void {
    const text = what === 'code' ? this.room.code : this.inviteLink();
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(what);
      setTimeout(() => this.copied.set(null), 1500);
    });
  }
}
