import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { PreferencesService } from './core/preferences.service';
import { Scenery } from './shared/scenery/scenery';
import { ConfirmDialog } from './shared/confirm-dialog/confirm-dialog';

@Component({
  imports: [RouterOutlet, Scenery, ConfirmDialog],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  private readonly prefs = inject(PreferencesService);
}
