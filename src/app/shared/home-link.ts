import { Directive, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmService } from '../core/confirm.service';

/**
 * The WhoAmI logo in a header, as a link to Home: `<a appHomeLink>logo + name</a>`.
 * Inside a room it asks first (`[askFirst]="true"`), so a tap on the logo mid-game doesn't pull you out.
 * Going Home doesn't leave the room: Join a room with the code brings you back.
 */
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
        // Ctrl / Cmd / Shift / middle click: let the browser open Home in a new tab or window.
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
