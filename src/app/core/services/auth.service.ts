import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, of } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { 
  AuthResultDto, 
  LoginRequest, 
  RefreshTokenRequest, 
  LogoutRequest, 
  UserDto 
} from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly ACCESS_TOKEN_KEY = 'realestate3d_access_token';
  private readonly REFRESH_TOKEN_KEY = 'realestate3d_refresh_token';
  private readonly USER_KEY = 'realestate3d_user';

  readonly currentUser = signal<UserDto | null>(this.getStoredUser());
  readonly isAuthenticated = computed(() => !!this.currentUser() && !!this.getAccessToken());
  readonly isAdmin = computed(() => this.currentUser()?.role === 'Admin');
  readonly isAgent = computed(() => this.currentUser()?.role === 'Agent');

  login(credentials: LoginRequest): Observable<AuthResultDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.login}`;
    return this.http.post<AuthResultDto>(url, credentials).pipe(
      tap((res) => {
        this.saveSession(res);
      })
    );
  }

  refreshToken(): Observable<AuthResultDto> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return throwError(() => new Error('No refresh token available'));
    }

    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.refresh}`;
    const req: RefreshTokenRequest = { refreshToken };
    return this.http.post<AuthResultDto>(url, req).pipe(
      tap((res) => {
        this.saveSession(res);
      }),
      catchError((err) => {
        this.clearSession();
        this.router.navigate(['/login']);
        return throwError(() => err);
      })
    );
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.logout}`;

    const finalizeLogout = () => {
      this.clearSession();
      this.router.navigate(['/login']);
    };

    if (refreshToken) {
      const req: LogoutRequest = { refreshToken };
      return this.http.post<void>(url, req).pipe(
        tap(() => finalizeLogout()),
        catchError(() => {
          finalizeLogout();
          return of(void 0);
        })
      );
    } else {
      finalizeLogout();
      return of(void 0);
    }
  }

  getAccessToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  private saveSession(res: AuthResultDto): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.ACCESS_TOKEN_KEY, res.accessToken);
      localStorage.setItem(this.REFRESH_TOKEN_KEY, res.refreshToken);
      localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
    }
    this.currentUser.set(res.user);
  }

  private clearSession(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.ACCESS_TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
    this.currentUser.set(null);
  }

  private getStoredUser(): UserDto | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as UserDto;
    } catch {
      return null;
    }
  }
}
