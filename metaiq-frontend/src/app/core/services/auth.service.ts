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

  private currentRoleSubject = new BehaviorSubject<Role | null>(null);
  public currentRole$ = this.currentRoleSubject.asObservable();

  private accessTokenSubject = new BehaviorSubject<string | null>(null);
  public accessToken$ = this.accessTokenSubject.asObservable();

  private authInitializedSubject = new BehaviorSubject<boolean>(false);
  public authInitialized$ = this.authInitializedSubject.asObservable();

  public isAuthenticated$ = this.accessTokenSubject.asObservable()
    .pipe(map(token => !!token));

  constructor() {
    localStorage.removeItem('accessToken');
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

  clearLocalSession(): void {
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

  isInitialized(): boolean {
    return this.authInitializedSubject.value;
  }

  initializeSession(): Observable<boolean> {
    if (this.isAuthenticated()) {
      this.authInitializedSubject.next(true);
      return of(true);
    }

    return this.ensureAuthenticated();
  }

  ensureAuthenticated(): Observable<boolean> {
    if (this.isAuthenticated()) {
      this.authInitializedSubject.next(true);
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
          this.authInitializedSubject.next(true);
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

  updateCurrentUserContext(partial: Partial<User>): void {
    const currentUser = this.currentUserSubject.value;
    if (!currentUser) {
      return;
    }

    const nextUser = { ...currentUser, ...partial };
    localStorage.setItem('user', JSON.stringify(nextUser));
    this.currentUserSubject.next(nextUser);
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.removeItem('accessToken');
    const role = this.normalizeRole(response.user.role);
    const userWithRole = { ...response.user, role };
    localStorage.setItem('user', JSON.stringify(userWithRole));
    this.currentUserSubject.next(userWithRole);
    this.currentRoleSubject.next(role);
    this.accessTokenSubject.next(response.accessToken);
    this.authInitializedSubject.next(true);
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
    this.authInitializedSubject.next(true);
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
    if (Object.values(Role).includes(resolvedRole as Role)) {
      return resolvedRole as Role;
    }

    throw new Error('Perfil de acesso inválido recebido do backend.');
  }
}
