import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { API_CONFIG } from '../config/api.config';
import { AuthResultDto } from '../models/auth.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });
    service = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should initialize with unauthenticated state when storage is empty', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('should store tokens and update signals on successful login', () => {
    const mockAuthResult: AuthResultDto = {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: 'usr-123',
        email: 'agent@test.local',
        fullName: 'Agent Ahmed',
        role: 'Agent',
        isActive: true,
        createdAt: '2026-11-21T00:00:00Z'
      }
    };

    service.login({ email: 'agent@test.local', password: 'Password123!' }).subscribe((res) => {
      expect(res.accessToken).toBe('test-access-token');
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isAgent()).toBe(true);
      expect(service.isAdmin()).toBe(false);
      expect(service.getAccessToken()).toBe('test-access-token');
    });

    const req = httpTesting.expectOne(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.auth.login}`);
    expect(req.request.method).toBe('POST');
    req.flush(mockAuthResult);
  });
});
