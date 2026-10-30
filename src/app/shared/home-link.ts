import { Directive, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmService } from '../core/confirm.service';

@Directive({
    selector: 'a[appHomeLink]',
    host: {
        href: '#/',
        class: 'home-link',
        'aria-label': 'WhoAmI: go to Home',
        '(click)': 'go($event)',
    },
})
export class HomeLink {
    @Input() askFirst = false;

    private readonly router = inject(Router);
    private readonly confirm = inject(ConfirmService);

    protected async go(event: MouseEvent): Promise<void> {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        if (this.askFirst) {
            const yes = await this.confirm.ask({
                tone: 'normal',
                title: 'Go to Home?',
                text: "You stay in this room. To come back, use Join a room with the room code.",
                confirmLabel: 'Go to Home',
                cancelLabel: 'Stay here',
            });
            if (!yes) return;
        }
        this.router.navigate(['/']);
    }
}
