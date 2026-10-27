import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ProfileService } from '../../core/profile.service';
import { SkySwitch } from '../../shared/sky-switch/sky-switch';
import { Logo } from '../../shared/logo/logo';
import { playerNameValidators } from '../../shared/validators';
import { AvatarChoice } from '../../shared/avatar-choice';
import { isAvatar } from '../../shared/avatars';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule, RouterLink, SkySwitch, Logo, AvatarChoice],
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

  protected get name() {
    return this.form.controls.name;
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
