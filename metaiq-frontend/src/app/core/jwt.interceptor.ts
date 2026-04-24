import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
  HttpContextToken,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap, map, finalize, shareReplay } from 'rxjs/operators';
import { AuthService } from './services/auth.service';
import { UiService } from './services/ui.service';
import { AuthResponse } from './models';

let refreshTokenRequest: Observable<string> | null = null;
const REFRESH_ATTEMPTED = new HttpContextToken<boolean>(() => false);
const AUTH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
const PUBLIC_API_URLS = [
  ...AUTH_URLS,
  '/ibge/states',
];
const PUBLIC_PAGE_ROUTES = ['/', '/auth', '/login', '/register'];

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const uiService = inject(UiService);
  const token = authService.getAccessToken();

  if (token && !isAuthUrl(req.url)) {
    req = addToken(req, token);
  }

  if (isAuthUrl(req.url)) {
    req = addCredentials(req);
  }

  return next(req).pipe(
    catchError(error => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        if (isPublicApiUrl(req.url)) {
          return throwError(() => error);
        }

        if (req.context.get(REFRESH_ATTEMPTED)) {
          forceCleanLogout(authService, router, uiService);
          return throwError(() => error);
        }

        if (!authService.canAttemptSessionRefresh()) {
          handleUnauthorizedWithoutRefresh(authService, router, uiService);
          return throwError(() => error);
        }

        return handle401Error(req, next, authService, router, uiService);
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

function addCredentials(req: HttpRequest<any>): HttpRequest<any> {
  return req.clone({ withCredentials: true });
}

function handle401Error(
  req: HttpRequest<any>,
  next: HttpHandlerFn,
  authService: AuthService,
  router: Router,
  uiService: UiService
): Observable<any> {
  if (!refreshTokenRequest) {
    refreshTokenRequest = authService.refreshToken().pipe(
      map((response: AuthResponse) => response.accessToken),
      shareReplay({ bufferSize: 1, refCount: false }),
      finalize(() => {
        refreshTokenRequest = null;
      })
    );
  }

  return refreshTokenRequest.pipe(
    switchMap((accessToken: string) => {
      if (!accessToken) {
        throw new Error('Falha ao renovar token');
      }
      return next(addToken(req.clone({
        context: req.context.set(REFRESH_ATTEMPTED, true),
      }), accessToken));
    }),
    catchError(err => {
      forceCleanLogout(authService, router, uiService);
      return throwError(() => err);
    })
  );
}

function isAuthUrl(url: string): boolean {
  return AUTH_URLS.some(path => url.includes(path));
}

function isPublicApiUrl(url: string): boolean {
  return PUBLIC_API_URLS.some(path => url.includes(path));
}

function isPublicPageRoute(url: string): boolean {
  return PUBLIC_PAGE_ROUTES.includes(url);
}

function handleUnauthorizedWithoutRefresh(
  authService: AuthService,
  router: Router,
  uiService: UiService
): void {
  authService.clearLocalSession();
  refreshTokenRequest = null;

  if (isPublicPageRoute(router.url)) {
    return;
  }

  uiService.showWarning('Sessão expirada', 'Faça login novamente para continuar.');
  router.navigate(['/auth'], {
    queryParams: { returnUrl: router.url },
  });
}

function forceCleanLogout(authService: AuthService, router: Router, uiService: UiService): void {
  handleUnauthorizedWithoutRefresh(authService, router, uiService);
}
