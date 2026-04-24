import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthResponse, Role } from '../models';
import { AuthService } from './auth.service';

describe('AuthService token storage', () => {
  let httpMock: HttpTestingController;

  const authResponse: AuthResponse = {
    accessToken: 'access-token',
    user: {
      id: 'user-1',
      email: 'admin@test.com',
      name: 'Admin',
      role: Role.ADMIN,
      accountType: 'AGENCY',
      storeId: null,
      businessName: 'MetaIQ',
      businessSegment: 'Marketing',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
      ],
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('keeps accessToken in memory instead of localStorage', () => {
    const service = TestBed.inject(AuthService);

    service.login({ email: 'admin@test.com', password: 'secret123' }).subscribe();

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/login'));
    expect(request.request.withCredentials).toBeTrue();
    request.flush(authResponse);

    expect(service.getAccessToken()).toBe('access-token');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('metaiq_session_hint')).toBe('1');
    expect(localStorage.getItem('user')).toContain('admin@test.com');
    expect(service.getCurrentUser()?.accountType).toBe('AGENCY');
    expect(service.getCurrentUser()?.storeId).toBeNull();
    expect(service.getCurrentUser()?.businessName).toBe('MetaIQ');
  });

  it('restores authentication after reload using the refresh cookie', (done) => {
    localStorage.setItem('metaiq_session_hint', '1');
    const service = TestBed.inject(AuthService);

    service.initializeSession().subscribe((authenticated) => {
      expect(authenticated).toBeTrue();
      expect(service.getAccessToken()).toBe('access-token');
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(service.isInitialized()).toBeTrue();
      done();
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/refresh'));
    expect(request.request.withCredentials).toBeTrue();
    request.flush(authResponse);
  });

  it('clears local session and finishes initialization when refresh fails', (done) => {
    localStorage.setItem('metaiq_session_hint', '1');
    const service = TestBed.inject(AuthService);

    service.initializeSession().subscribe((authenticated) => {
      expect(authenticated).toBeFalse();
      expect(service.getAccessToken()).toBeNull();
      expect(service.getCurrentUser()).toBeNull();
      expect(service.isInitialized()).toBeTrue();
      done();
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/refresh'));
    expect(request.request.withCredentials).toBeTrue();
    request.flush({ message: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
  });

  it('does not start a second refresh while session restoration is pending', () => {
    localStorage.setItem('metaiq_session_hint', '1');
    const service = TestBed.inject(AuthService);

    service.ensureAuthenticated().subscribe();
    service.ensureAuthenticated().subscribe();

    const requests = httpMock.match((req) => req.url.endsWith('/auth/refresh'));
    expect(requests.length).toBe(1);
    expect(requests[0].request.withCredentials).toBeTrue();
    requests[0].flush(authResponse);
  });

  it('clears local and remote session on logout', () => {
    const service = TestBed.inject(AuthService);

    service.login({ email: 'admin@test.com', password: 'secret123' }).subscribe();
    httpMock.expectOne((req) => req.url.endsWith('/auth/login')).flush(authResponse);

    expect(service.getAccessToken()).toBe('access-token');

    service.logout();

    const logoutRequest = httpMock.expectOne((req) => req.url.endsWith('/auth/logout'));
    expect(logoutRequest.request.withCredentials).toBeTrue();
    expect(service.getAccessToken()).toBeNull();
    expect(service.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('metaiq_session_hint')).toBeNull();
    logoutRequest.flush({ success: true });
  });

  it('does not attempt refresh restoration without a session hint', (done) => {
    const service = TestBed.inject(AuthService);

    service.initializeSession().subscribe((authenticated) => {
      expect(authenticated).toBeFalse();
      expect(service.isInitialized()).toBeTrue();
      expect(service.getAccessToken()).toBeNull();
      done();
    });

    httpMock.expectNone((req) => req.url.endsWith('/auth/refresh'));
  });

  it('rejects unknown backend roles instead of falling back to an operational profile', () => {
    const service = TestBed.inject(AuthService);

    service.login({ email: 'admin@test.com', password: 'secret123' }).subscribe({
      next: () => fail('login should fail for an unknown role'),
      error: (error) => {
        expect(error.message).toContain('Perfil de acesso inválido');
        expect(service.getAccessToken()).toBeNull();
        expect(service.getCurrentUser()).toBeNull();
      },
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/login'));
    request.flush({
      ...authResponse,
      user: {
        ...authResponse.user,
        role: 'UNKNOWN_ROLE' as Role,
      },
    });
  });
});
