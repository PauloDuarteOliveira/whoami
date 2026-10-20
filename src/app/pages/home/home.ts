import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProfileService } from '../../core/profile.service';
import { isCodeChar, playerNameValidators, roomCodeValidators } from '../../shared/validators';

@Component({
  selector: 'app-home',
  imports: [ReactiveFormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private readonly profile = inject(ProfileService);
  private readonly router = inject(Router);

  protected readonly form = new FormGroup({
    name: new FormControl(this.profile.name(), { nonNullable: true, validators: playerNameValidators }),
    code: new FormControl('', { nonNullable: true, validators: roomCodeValidators }),
  });

  protected get name() {
    return this.form.controls.name;
  }

  protected get code() {
    return this.form.controls.code;
  }

  /** Keeps the code in capitals and drops anything that isn't A–Z or 0–9. */
  protected upperCaseCode(): void {
    const clean = [...this.code.value.toUpperCase()].filter(isCodeChar).join('');
    if (clean !== this.code.value) {
      this.code.setValue(clean);
    }
  }

  /** Create only needs a valid name. */
  protected create(): void {
    if (this.name.invalid) {
      this.name.markAsTouched();
      return;
    }
    this.profile.setName(this.name.value);
    this.router.navigate(['/create']);
  }

  /** Join needs a valid name and a 4-character code. */
  protected join(): void {
    if (this.name.invalid || this.code.invalid) {
      this.name.markAsTouched();
      this.code.markAsTouched();
      return;
    }
    this.profile.setName(this.name.value);
    this.router.navigate(['/join', this.code.value]);
  }
}