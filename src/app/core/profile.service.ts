import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'whoami.name';

@Injectable({ providedIn: 'root' })
export class ProfileService {
    readonly name = signal(this.load());

    setName(name: string): void {
        const clean = name.trim();
        this.name.set(clean);
        try {
            localStorage.setItem(STORAGE_KEY, clean);
        } catch {
        }
    }

    private load(): string {
        try {
            return localStorage.getItem(STORAGE_KEY) ?? '';
        } catch {
            return '';
        }
    }
}