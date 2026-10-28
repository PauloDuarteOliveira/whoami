import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { HistoryService, OpenRoom } from '../../core/history.service';
import { ProfileService } from '../../core/profile.service';
import { SessionService } from '../../core/session.service';
import { SkySwitch } from '../../shared/sky-switch/sky-switch';
import { Logo } from '../../shared/logo/logo';
import { HomeLink } from '../../shared/home-link';
import { MeChip } from '../../shared/me-chip';
import { playerNameValidators } from '../../shared/validators';
import { AvatarChoice } from '../../shared/avatar-choice';
import { isAvatar } from '../../shared/avatars';
import { trapFocus } from '../../shared/focus';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink, SkySwitch, Logo, AvatarChoice, HomeLink, MeChip],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly auth = inject(AuthService);
  protected readonly profile = inject(ProfileService);
  private readonly router = inject(Router);

  /** Home only asks for your name; the room code is asked on the Join screen (or comes in the invite link). */
  protected readonly form = new FormGroup({
    name: new FormControl(this.profile.name(), { nonNullable: true, validators: playerNameValidators }),
  });

  private readonly history = inject(HistoryService);
  private readonly sessions = inject(SessionService);

  /** Rooms you're still in, for "Continue playing". */
  protected readonly openRooms = signal<OpenRoom[]>([]);
  protected readonly phaseLabel: Record<OpenRoom['room']['status'], string> = { lobby: 'Lobby', writing: 'Writing characters', playing: 'Game in progress' };

  constructor() {
    const userId = this.auth.userId();
    if (userId) {
      // Nothing to show when it fails: Home works as before.
      this.history.openRooms(userId).subscribe({ next: rooms => this.openRooms.set(rooms), error: () => undefined });
    }
  }

  /** Back into a room: this tab remembers you're that player, then the room opens. */
  protected rejoin(r: OpenRoom): void {
    this.sessions.save(r.room.code, r.id);
    this.router.navigate(['/room', r.room.code]);
  }

  /** The "How to play" dialog. */
  protected readonly rulesOpen = signal(false);
  private readonly rulesBox = viewChild<ElementRef<HTMLElement>>('rulesBox');
  private returnFocus: HTMLElement | null = null;

  protected get name() {
    return this.form.controls.name;
  }

  protected openRules(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.rulesOpen.set(true);
    // Focus "Got it" once the dialog is on screen, so Enter or Escape closes it.
    setTimeout(() => this.rulesBox()?.nativeElement.querySelector<HTMLElement>('[data-close]')?.focus());
  }

  protected closeRules(): void {
    this.rulesOpen.set(false);
    this.returnFocus?.focus?.();
    this.returnFocus = null;
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const box = this.rulesBox()?.nativeElement;
    if (!this.rulesOpen() || !box) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeRules();
    } else if (event.key === 'Tab') {
      trapFocus(box, event);
    }
  }

  protected setAvatar(avatar: string): void {
    if (isAvatar(avatar)) this.profile.setAvatar(avatar);
  }

  protected create(): void {
    this.go('/create');
  }

  protected join(): void {
    this.go('/join');
  }

  /** Both need a valid name, which is remembered for the next screen. */
  private go(path: string): void {
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.profile.setName(this.name.value);
    this.router.navigate([path]);
  }
}
