import { Injectable, signal } from '@angular/core';
import { DialogIconName } from '../shared/dialog-icon/dialog-icon';

export type DialogTone = 'danger' | 'warn' | 'normal';

export interface ConfirmOptions {
    title: string;
    text: string;
    confirmLabel: string;
    cancelLabel?: string;
    tone?: DialogTone;
    icon?: DialogIconName;
    card?: { label: string; name: string; avatar?: { letter: string; color: string; image?: string | null } };
    note?: string;
}

interface Request extends ConfirmOptions {
    answer: (yes: boolean) => void;
}

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
