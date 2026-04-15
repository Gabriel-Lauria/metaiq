import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { tap, catchError, timeout, retry, map } from 'rxjs/operators';
import { AuthResponse, LoginRequest, RegisterRequest, Role, User } from '../models';
import { environment } from '../environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

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
      } catch (e) {
        console.error('Erro ao carregar usuário do localStorage:', e);
        this.logout();
      }
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API}/auth/login`, credentials).pipe(
      tap((response) => this.handleAuthResponse(response))
    );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    this.currentUserSubject.next(null);
    this.currentRoleSubject.next(null);
    this.accessTokenSubject.next(null);
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
    localStorage.setItem('role', role);
    this.currentUserSubject.next(userWithRole);
    this.currentRoleSubject.next(role);
    this.accessTokenSubject.next(response.accessToken);
  }

  private getStoredRole(): Role | null {
    const role = localStorage.getItem('role') as Role | null;
    return role ? this.normalizeRole(role) : null;
  }

  private normalizeRole(role: unknown): Role {
    const normalized = typeof role === 'string' ? role.toUpperCase() : '';
    return Object.values(Role).includes(normalized as Role)
      ? (normalized as Role)
      : Role.OPERATIONAL;
  }
}
