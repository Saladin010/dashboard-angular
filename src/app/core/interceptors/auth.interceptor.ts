import { inject } from '@angular/core';
import { 
  HttpInterceptorFn, 
  HttpRequest, 
  HttpHandlerFn, 
  HttpErrorResponse 
} from '@angular/common/http';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Exclude auth login and refresh calls from attaching expired tokens or loops
  const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/refresh');

  let authReq = req;
  if (token && !isAuthEndpoint) {
    authReq = addToken(req, token);
  }

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint) {
        return handle401Error(authReq, next, authService);
      }
      return throwError(() => error);
    })
  );
};

function addToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

function handle401Error(
  req: HttpRequest<unknown>, 
  next: HttpHandlerFn, 
  authService: AuthService
) {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.refreshToken().pipe(
      switchMap((authResult) => {
        isRefreshing = false;
        refreshTokenSubject.next(authResult.accessToken);
        return next(addToken(req, authResult.accessToken));
      }),
      catchError((refreshErr) => {
        isRefreshing = false;
        authService.logout().subscribe();
        return throwError(() => refreshErr);
      })
    );
  } else {
    // Wait until refresh token completes and replay
    return refreshTokenSubject.pipe(
      filter((t) => t !== null),
      take(1),
      switchMap((t) => next(addToken(req, t!)))
    );
  }
}
