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
    expect(localStorage.getItem('user')).toContain('admin@test.com');
  });

  it('restores authentication after reload using the refresh cookie', (done) => {
    localStorage.setItem('accessToken', 'stale-token');
    const service = TestBed.inject(AuthService);

    service.ensureAuthenticated().subscribe((authenticated) => {
      expect(authenticated).toBeTrue();
      expect(service.getAccessToken()).toBe('access-token');
      expect(localStorage.getItem('accessToken')).toBeNull();
      done();
    });

    const request = httpMock.expectOne((req) => req.url.endsWith('/auth/refresh'));
    expect(request.request.withCredentials).toBeTrue();
    request.flush(authResponse);
  });
});
