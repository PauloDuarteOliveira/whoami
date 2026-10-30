import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type Sky = 'night' | 'day';

const HIDE_NAMES_KEY = 'whoami.hideNames';
const SKY_KEY = 'whoami.sky';

@Injectable({ providedIn: 'root' })
export class PreferencesService {
    private readonly document = inject(DOCUMENT);

    readonly hideNames = signal(read(HIDE_NAMES_KEY) === 'true');

    private chosen = isSky(read(SKY_KEY));

    readonly sky = signal<Sky>(this.chosen ? (read(SKY_KEY) as Sky) : deviceSky());

    constructor() {
        effect(() => {
            const sky = this.sky();
            this.document.documentElement.dataset['sky'] = sky;
            this.document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky === 'day' ? '#BDE7F0' : '#0A3440');
        });
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
        /* storage blocked */
    }
}
