import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, map, finalize, shareReplay } from 'rxjs/operators';
import { AuthService } from './auth.service';

let isRefreshing = false;
let refreshTokenRequest: Observable<string> | null = null;

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  if (token && !isWhitelistedUrl(req.url)) {
    req = addToken(req, token);
  }

  return next(req).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return handle401Error(req, next, authService);
      }
      return throwError(() => error);
    })
  );
};

function addToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function handle401Error(
  req: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService
): Observable<any> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenRequest = authService.refreshToken().pipe(
      map((response: any) => response.accessToken),
      shareReplay(1),
      finalize(() => {
        isRefreshing = false;
        refreshTokenRequest = null;
      })
    );
  }

  return (refreshTokenRequest ?? authService.refreshToken().pipe(
    map((response: any) => response.accessToken)
  )).pipe(
    switchMap((accessToken: string) => {
      if (!accessToken) {
        throw new Error('Falha ao renovar token');
      }
      return next(addToken(req, accessToken));
    }),
    catchError(err => {
      authService.logout();
      return throwError(() => err);
    })
  );
}

function isWhitelistedUrl(url: string): boolean {
  const whitelist = ['/auth/login', '/auth/register', '/auth/refresh'];
  return whitelist.some(path => url.includes(path));
}
