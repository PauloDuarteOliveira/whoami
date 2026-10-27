import { Injectable, signal } from '@angular/core';
import { cleanName } from '../shared/validators';
import { AvatarId, isAvatar, randomAvatar } from '../shared/avatars';

const STORAGE_KEY = 'whoami.name';
const AVATAR_KEY = 'whoami.avatar';

@Injectable({ providedIn: 'root' })
export class ProfileService {
    readonly name = signal(this.load());
    /** Your animal, remembered like your name; a random one the first time. */
    readonly avatar = signal<AvatarId>(this.loadAvatar());

    setAvatar(avatar: AvatarId): void {
        this.avatar.set(avatar);
        try {
            localStorage.setItem(AVATAR_KEY, avatar);
        } catch {
            // Storage blocked: the avatar just isn't remembered.
        }
    }

    private loadAvatar(): AvatarId {
        try {
            const saved = localStorage.getItem(AVATAR_KEY);
            if (isAvatar(saved)) return saved;
        } catch {
            // Storage blocked.
        }
        return randomAvatar();
    }

    setName(name: string): void {
        const clean = cleanName(name);
        this.name.set(clean);
        try {
            localStorage.setItem(STORAGE_KEY, clean);
        } catch {
            // Storage blocked (e.g. private mode): the name just isn't remembered.
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