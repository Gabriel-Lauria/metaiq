import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { jwtInterceptor } from './jwt.interceptor';
import { AuthResponse, Role } from './models';
import { AuthService } from './services/auth.service';
import { UiService } from './services/ui.service';

describe('jwtInterceptor session refresh', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let uiService: jasmine.SpyObj<UiService>;

  const authResponse: AuthResponse = {
    accessToken: 'new-access-token',
    user: {
      id: 'user-1',
      email: 'admin@test.com',
      name: 'Admin',
      role: Role.ADMIN,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>('AuthService', [
      'getAccessToken',
      'refreshToken',
      'clearLocalSession',
      'canAttemptSessionRefresh',
    ]);
    router = jasmine.createSpyObj<Router>('Router', ['navigate'], { url: '/dashboard' });
    uiService = jasmine.createSpyObj<UiService>('UiService', ['showWarning']);
    authService.getAccessToken.and.returnValue(null);
    authService.canAttemptSessionRefresh.and.returnValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([jwtInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: UiService, useValue: uiService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('does not trigger refresh for auth endpoints', (done) => {
    http.post('/api/auth/refresh', {}).subscribe({
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).not.toHaveBeenCalled();
        expect(authService.clearLocalSession).not.toHaveBeenCalled();
        done();
      },
    });

    const request = httpMock.expectOne('/api/auth/refresh');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('does not trigger refresh for public ibge endpoints', (done) => {
    http.get('/api/ibge/states').subscribe({
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).not.toHaveBeenCalled();
        expect(authService.clearLocalSession).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        expect(uiService.showWarning).not.toHaveBeenCalled();
        done();
      },
    });

    const request = httpMock.expectOne('/api/ibge/states');
    request.flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('serializes concurrent 401 refresh attempts into one refresh call', () => {
    const refreshSubject = new Subject<AuthResponse>();
    authService.refreshToken.and.returnValue(refreshSubject.asObservable());

    http.get('/api/protected-a').subscribe();
    http.get('/api/protected-b').subscribe();

    httpMock.expectOne('/api/protected-a')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne('/api/protected-b')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.refreshToken).toHaveBeenCalledTimes(1);

    refreshSubject.next(authResponse);
    refreshSubject.complete();

    const retryA = httpMock.expectOne('/api/protected-a');
    const retryB = httpMock.expectOne('/api/protected-b');
    expect(retryA.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    expect(retryB.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retryA.flush({ ok: true });
    retryB.flush({ ok: true });
  });

  it('does not retry indefinitely when the retried request also returns 401', (done) => {
    authService.refreshToken.and.returnValue(of(authResponse));

    http.get('/api/protected').subscribe({
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).toHaveBeenCalledTimes(1);
        expect(authService.clearLocalSession).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/auth'], {
          queryParams: { returnUrl: '/dashboard' },
        });
        done();
      },
    });

    httpMock.expectOne('/api/protected')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });

    const retry = httpMock.expectOne('/api/protected');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access-token');
    retry.flush({ message: 'expired again' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('does not call refresh when there is no active or recoverable session', (done) => {
    authService.canAttemptSessionRefresh.and.returnValue(false);

    http.get('/api/protected').subscribe({
      error: (error) => {
        expect(error.status).toBe(401);
        expect(authService.refreshToken).not.toHaveBeenCalled();
        expect(authService.clearLocalSession).toHaveBeenCalled();
        expect(router.navigate).toHaveBeenCalledWith(['/auth'], {
          queryParams: { returnUrl: '/dashboard' },
        });
        done();
      },
    });

    httpMock.expectOne('/api/protected')
      .flush({ message: 'expired' }, { status: 401, statusText: 'Unauthorized' });
  });
});
