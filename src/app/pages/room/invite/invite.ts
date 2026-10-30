import { Component, ElementRef, HostListener, Input, OnChanges, signal, viewChild } from '@angular/core';
import QRCode from 'qrcode';
import { trapFocus } from '../../../shared/focus';

@Component({
  selector: 'app-invite',
  templateUrl: './invite.html',
  styleUrl: './invite.css',
  host: { '[class.compact]': 'compact' },
})
export class Invite implements OnChanges {
  @Input({ required: true }) code = '';
  @Input() hint = '';
  @Input() compact = false;

  protected readonly copied = signal<'code' | 'link' | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
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
