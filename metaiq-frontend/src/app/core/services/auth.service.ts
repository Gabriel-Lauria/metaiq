import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { AuthResponse, LoginRequest, RegisterRequest, Role, User } from '../models';
import { environment } from '../environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly sessionKeys = [
    'accessToken',
    'refreshToken',
    'user',
    'selectedStoreId',
  ];

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  private currentRoleSubject = new BehaviorSubject<Role | null>(
    this.getStoredRole()
  );
  public currentRole$ = this.currentRoleSubject.asObservable();

  private accessTokenSubject = new BehaviorSubject<string | null>(
    localStorage.getItem('accessToken')
  );
  public accessToken$ = this.accessTokenSubject.asObservable();

  public isAuthenticated$ = this.accessTokenSubject.asObservable()
    .pipe(map(token => !!token));

  constructor() {
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
    return this.http.post<AuthResponse>(`${API}/auth/login`, credentials).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    this.clearSessionState();
    return this.http.post<AuthResponse>(`${API}/auth/register`, data).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      return throwError(() => new Error('Refresh token não encontrado'));
    }

    return this.http.post<AuthResponse>(`${API}/auth/refresh`, { refreshToken }).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  logout(): void {
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

  hasAnyRole(roles: Role[]): boolean {
    const currentRole = this.getCurrentRole();
    return !!currentRole && roles.includes(currentRole);
  }

  private handleAuthResponse(response: AuthResponse): void {
    localStorage.setItem('accessToken', response.accessToken);
    localStorage.setItem('refreshToken', response.refreshToken);
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
    const normalized = typeof role === 'string' ? role.toUpperCase() : '';
    return Object.values(Role).includes(normalized as Role)
      ? (normalized as Role)
      : Role.OPERATIONAL;
  }
}
