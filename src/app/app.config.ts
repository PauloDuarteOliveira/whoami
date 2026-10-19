import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash URLs (/#/room/K7QX) so page refreshes work on GitHub Pages.
    provideRouter(routes, withHashLocation()),
    provideHttpClient(withFetch()),
  ]
};