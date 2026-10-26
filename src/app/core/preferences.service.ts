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

    /** Palm shadows Day / Night. Night is the default. */
    readonly sky = signal<Sky>(read(SKY_KEY) === 'day' ? 'day' : 'night');

    constructor() {
        // The page's colours follow html[data-sky] (see styles.css).
        effect(() => {
            this.document.documentElement.dataset['sky'] = this.sky();
        });
    }

    toggleHideNames(): void {
        this.hideNames.update(hidden => !hidden);
        write(HIDE_NAMES_KEY, String(this.hideNames()));
    }

    setSky(sky: Sky): void {
        this.sky.set(sky);
        write(SKY_KEY, sky);
    }
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
