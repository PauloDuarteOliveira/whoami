import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Sky = 'night' | 'day';

const HIDE_NAMES_KEY = 'whoami.hideNames';
const SKY_KEY = 'whoami.sky';

/** Display choices that only affect this device, remembered between games. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
    private readonly document = inject(DOCUMENT);

    /** Hide the other players' characters, for people sitting side by side or playing on a phone. */
    readonly hideNames = signal(read(HIDE_NAMES_KEY) === 'true');

    /** Whether this device picked Day or Night with the switch. Until it does, the sky follows the device. */
    private chosen = isSky(read(SKY_KEY));

    /** Palm shadows Day / Night: the saved choice, or on a first visit the device's light or dark mode. */
    readonly sky = signal<Sky>(this.chosen ? (read(SKY_KEY) as Sky) : deviceSky());

    constructor() {
        // The page's colours follow html[data-sky] (see styles.css), and the phone's browser bar matches.
        effect(() => {
            const sky = this.sky();
            this.document.documentElement.dataset['sky'] = sky;
            this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky === 'day' ? '#BDE7F0' : '#0A3440');
        });
        // If the device switches between light and dark while the app is open, follow it, unless you chose.
        lightMode()?.addEventListener('change', event => {
            if (!this.chosen) this.sky.set(event.matches ? 'day' : 'night');
        });
    }

    toggleHideNames(): void {
        this.hideNames.update(hidden => !hidden);
        write(HIDE_NAMES_KEY, String(this.hideNames()));
    }

    setSky(sky: Sky): void {
        this.chosen = true;
        this.sky.set(sky);
        write(SKY_KEY, sky);
    }
}

function isSky(value: string | null): value is Sky {
    return value === 'day' || value === 'night';
}

function lightMode(): MediaQueryList | null {
    return typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
}

/** Day for a device in light mode, Night for dark mode (and when the browser doesn't say). */
function deviceSky(): Sky {
    return lightMode()?.matches ? 'day' : 'night';
}

function read(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function write(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage blocked (e.g. private mode): the choice only lasts until the page reloads.
    }
}
