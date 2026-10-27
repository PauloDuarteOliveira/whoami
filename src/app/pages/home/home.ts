import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';
import { SkySwitch } from '../../shared/sky-switch/sky-switch';
import { Logo } from '../../shared/logo/logo';
import { HomeLink } from '../../shared/home-link';
import { playerNameValidators } from '../../shared/validators';
import { AvatarChoice } from '../../shared/avatar-choice';
import { isAvatar } from '../../shared/avatars';
import { trapFocus } from '../../shared/focus';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink, SkySwitch, Logo, AvatarChoice, HomeLink],
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
