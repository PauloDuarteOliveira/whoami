import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
    const token = inject(AuthService).accessToken();
    if (!token || !request.url.startsWith(environment.supabaseUrl)) {
        return next(request);
    }
    return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
