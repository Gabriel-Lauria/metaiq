import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest, Role, User } from '../models';
import { environment } from '../environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly sessionKeys = [
    'accessToken',
    'user',
    'selectedStoreId',
  ];
  private refreshSessionRequest: Observable<boolean> | null = null;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private currentRoleSubject = new BehaviorSubject<Role | null>(
    this.getStoredRole()
  );
  public currentRole$ = this.currentRoleSubject.asObservable();

  private accessTokenSubject = new BehaviorSubject<string | null>(null);
  public accessToken$ = this.accessTokenSubject.asObservable();

  public isAuthenticated$ = this.accessTokenSubject.asObservable()
    .pipe(map(token => !!token));

  constructor() {
    localStorage.removeItem('accessToken');
    this.loadUserFromStorage();
  }

  private loadUserFromStorage(): void {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsedUser = JSON.parse(user) as User;
        const role = this.normalizeRole(parsedUser.role);
        const userWithRole = { ...parsedUser, role };
        this.currentUserSubject.next(userWithRole);
        this.currentRoleSubject.next(role);
      } catch {
        this.logout();
      }
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    this.clearSessionState();
    return this.http.post<AuthResponse>(`${API}/auth/login`, credentials, { withCredentials: true }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    this.clearSessionState();
    return this.http.post<AuthResponse>(`${API}/auth/register`, data, { withCredentials: true }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  refreshToken(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/refresh`, {}, { withCredentials: true }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  logout(): void {
    this.http.post(`${API}/auth/logout`, {}, { withCredentials: true }).subscribe({
      error: () => undefined,
    });
    this.clearSessionState();
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getAccessToken(): string | null {
    return this.accessTokenSubject.value;
  }

  getCurrentRole(): Role | null {
    return this.currentRoleSubject.value;
  }

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  }

  ensureAuthenticated(): Observable<boolean> {
    if (this.isAuthenticated()) {
      return of(true);
    }

    if (!this.refreshSessionRequest) {
      this.refreshSessionRequest = this.refreshToken().pipe(
        map(() => true),
        catchError(() => {
          this.clearSessionState();
          return of(false);
        }),
        finalize(() => {
          this.refreshSessionRequest = null;
        }),
        shareReplay(1),
      );
    }

    return this.refreshSessionRequest;
  }

  hasAnyRole(roles: Role[]): boolean {
    const currentRole = this.getCurrentRole();
    return !!currentRole && roles.includes(currentRole);
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.removeItem('accessToken');
    const role = this.normalizeRole(response.user.role);
    const userWithRole = { ...response.user, role };
    localStorage.setItem('user', JSON.stringify(userWithRole));
    this.currentUserSubject.next(userWithRole);
    this.currentRoleSubject.next(role);
    this.accessTokenSubject.next(response.accessToken);
  }

  private clearSessionStorage(): void {
    for (const key of this.sessionKeys) {
      localStorage.removeItem(key);
    }
  }

  private clearSessionState(): void {
    this.clearSessionStorage();
    this.currentUserSubject.next(null);
    this.currentRoleSubject.next(null);
    this.accessTokenSubject.next(null);
  }

  private getStoredRole(): Role | null {
    const user = localStorage.getItem('user');
    if (!user) return null;

    try {
      return this.normalizeRole((JSON.parse(user) as User).role);
    } catch {
      return null;
    }
  }

  private normalizeRole(role: unknown): Role {
    const normalized = typeof role === 'string' ? role.trim().toUpperCase() : '';
    const aliases: Record<string, Role> = {
      SUPER_ADMIN: Role.PLATFORM_ADMIN,
      PLATFORMADMIN: Role.PLATFORM_ADMIN,
      TENANT_ADMIN: Role.ADMIN,
      COMPANY_ADMIN: Role.ADMIN,
      ACCOUNT_ADMIN: Role.ADMIN,
      SUPERVISOR: Role.MANAGER,
      MEDIA_BUYER: Role.OPERATIONAL,
      OPERATOR: Role.OPERATIONAL,
      CUSTOMER: Role.CLIENT,
    };

    const resolvedRole = aliases[normalized] ?? normalized;
    return Object.values(Role).includes(resolvedRole as Role)
      ? (resolvedRole as Role)
      : Role.OPERATIONAL;
  }
}
