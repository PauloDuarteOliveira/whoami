import { Component, ElementRef, HostListener, Input, OnChanges, signal, viewChild } from '@angular/core';
import QRCode from 'qrcode';
import { trapFocus } from '../../../shared/focus';

/**
 * The room's code to share: the big code, Share / QR code / Copy buttons and the QR code of the invite link
 * (on a phone, the QR code opens full screen instead). Used by the Lobby and the lobby after a game;
 * whatever is put inside <app-invite> shows under the QR code (the Admin's Next game settings, a note…).
 */
@Component({
  selector: 'app-invite',
  templateUrl: './invite.html',
  styleUrl: './invite.css',
  host: { '[class.compact]': 'compact' },
})
export class Invite implements OnChanges {
  @Input({ required: true }) code = '';
  /** The line under the buttons. */
  @Input() hint = '';
  /** Compact: the QR code sits next to the code, leaving room for what's under it. */
  @Input() compact = false;

  protected readonly copied = signal<'code' | 'link' | null>(null);
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
    if (this.code === this.qrFor) return;
    this.qrFor = this.code;
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
    navigator.share({ title: 'Join my WhoAmI room', text: `Join my WhoAmI room with the code ${this.code}`, url: this.inviteLink() })
      .catch(() => undefined);
  }

  protected inviteLink(): string {
    return `${location.origin}${location.pathname}#/join/${this.code}`;
  }

  protected copy(what: 'code' | 'link'): void {
    const text = what === 'code' ? this.code : this.inviteLink();
    navigator.clipboard?.writeText(text).then(() => {
      this.copied.set(what);
      setTimeout(() => this.copied.set(null), 1500);
    });
  }
}
