import { Injectable, signal } from '@angular/core';
import { DialogIconName } from '../shared/dialog-icon/dialog-icon';

/** red: can't be taken back (Kick, Give up) · warn: starts something (Report) · normal: everything else. */
export type DialogTone = 'danger' | 'warn' | 'normal';

export interface ConfirmOptions {
    title: string;
    text: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: DialogTone;
    icon?: DialogIconName;
    /** Shows a character (or another thing being decided on) as a card under the text. */
    card?: { label: string; name: string; avatar?: { letter: string; color: string; image?: string | null } };
    /** A highlighted line under the text, in the tone's colour. */
    note?: string;
}

interface Request extends ConfirmOptions {
    answer: (yes: boolean) => void;
}

/**
 * Themed confirmation boxes instead of the browser's confirm(): `if (await confirm.ask({...}))`.
 * The box itself is <app-confirm-dialog>, shown once in the app shell.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
    readonly request = signal<Request | null>(null);

    ask(options: ConfirmOptions): Promise<boolean> {
        this.request()?.answer(false);
        return new Promise(resolve => {
            this.request.set({
                ...options,
                answer: yes => {
                    this.request.set(null);
                    resolve(yes);
                },
            });
        });
    }
}
