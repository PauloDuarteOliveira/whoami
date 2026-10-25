import { Injectable, signal } from '@angular/core';

const HIDE_NAMES_KEY = 'whoami.hideNames';

/** Display choices that only affect this device, remembered between games. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
    /** Blur the other players' characters, for people sitting side by side or playing on a phone. */
    readonly hideNames = signal(this.load());

    toggleHideNames(): void {
        this.hideNames.update(hidden => !hidden);
        try {
            localStorage.setItem(HIDE_NAMES_KEY, String(this.hideNames()));
        } catch {
            // Storage blocked (e.g. private mode): the choice only lasts until the page reloads.
        }
    }

    private load(): boolean {
        try {
            return localStorage.getItem(HIDE_NAMES_KEY) === 'true';
        } catch {
            return false;
        }
    }
}
