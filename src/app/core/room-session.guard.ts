import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

/** Only opens a room if this tab already joined it; otherwise it sends you to the join page for that code. */
export const roomSessionGuard: CanActivateFn = route => {
    const code = (route.paramMap.get('code') ?? '').toUpperCase();
    return inject(SessionService).getPlayerId(code) ? true : inject(Router).createUrlTree(['/join', code]);
};
