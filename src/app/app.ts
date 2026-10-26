import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { PreferencesService } from './core/preferences.service';
import { Scenery } from './shared/scenery/scenery';

@Component({
  imports: [RouterOutlet, Scenery],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
  // Created here so the saved Day / Night choice is applied before the first screen shows.
  private readonly prefs = inject(PreferencesService);
}
