import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="login-page" [attr.dir]="i18n.dir()">
      <div class="login-card">
        <div class="card-header">
          <div class="logo-box">3D</div>
          <h1>{{ i18n.t('auth.loginTitle') }}</h1>
          <p>{{ i18n.t('auth.loginSubtitle') }}</p>
        </div>

        @if (deactivatedError()) {
          <div class="alert alert-danger">
            <span class="alert-icon">⚠️</span>
            <div class="alert-body">
              <strong>حساب معطل</strong>
              <p>{{ i18n.t('auth.deactivatedAlert') }}</p>
            </div>
          </div>
        }

        @if (errorMessage() && !deactivatedError()) {
          <div class="alert alert-warning">
            <span>⚠️</span>
            <p>{{ errorMessage() }}</p>
          </div>
        }

        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label for="email">{{ i18n.t('auth.email') }}</label>
            <input 
              id="email" 
              type="email" 
              formControlName="email" 
              class="input-control" 
              placeholder="admin@realestate3d.local"
            />
          </div>

          <div class="form-group">
            <label for="password">{{ i18n.t('auth.password') }}</label>
            <input 
              id="password" 
              type="password" 
              formControlName="password" 
              class="input-control" 
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            class="btn btn-primary btn-block" 
            [disabled]="loginForm.invalid || isLoading()"
          >
            @if (isLoading()) {
              <span>{{ i18n.t('auth.signingIn') }}</span>
            } @else {
              <span>{{ i18n.t('auth.submit') }}</span>
            }
          </button>
        </form>

        <div class="card-footer">
          <button class="lang-switch-btn" (click)="i18n.toggleLanguage()">
            🌐 {{ i18n.currentLang() === 'ar' ? 'English' : 'العربية' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 50%, #1e293b 0%, #0b1120 100%);
      padding: 1.5rem;
    }

    .login-card {
      width: 100%;
      max-width: 440px;
      background-color: var(--bg-surface, #1e293b);
      border: 1px solid var(--border-color, #334155);
      border-radius: 1rem;
      padding: 2.5rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);

      .card-header {
        text-align: center;
        margin-bottom: 2rem;

        .logo-box {
          width: 56px;
          height: 56px;
          margin: 0 auto 1rem;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border-radius: 0.75rem;
          color: #ffffff;
          font-size: 1.5rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        h1 {
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-main, #f8fafc);
          margin-bottom: 0.35rem;
        }

        p {
          font-size: 0.825rem;
          color: var(--text-muted, #94a3b8);
        }
      }

      .alert {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        border-radius: 0.5rem;
        font-size: 0.825rem;
        margin-bottom: 1.5rem;

        &.alert-danger {
          background-color: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          color: #fca5a5;

          strong {
            display: block;
            margin-bottom: 0.25rem;
            color: #ef4444;
          }
        }

        &.alert-warning {
          background-color: rgba(245, 158, 11, 0.15);
          border: 1px solid rgba(245, 158, 11, 0.4);
          color: #fde68a;
        }
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;

          label {
            font-size: 0.825rem;
            font-weight: 600;
            color: var(--text-main, #f8fafc);
          }
        }

        .btn-block {
          width: 100%;
          padding: 0.75rem;
          margin-top: 0.5rem;
        }
      }

      .card-footer {
        margin-top: 2rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--border-color, #334155);
        display: flex;
        justify-content: center;

        .lang-switch-btn {
          font-size: 0.75rem;
          color: var(--text-muted, #94a3b8);
          &:hover {
            color: #10b981;
          }
        }
      }
    }
  `]
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly i18n = inject(I18nService);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly deactivatedError = signal(false);

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.deactivatedError.set(false);

    this.authService.login(this.loginForm.getRawValue()).subscribe({
      next: () => {
        this.isLoading.set(false);
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err: any) => {
        this.isLoading.set(false);
        const detail = err?.error?.detail || err?.error?.message || err?.message || '';
        
        if (err?.status === 401 && (detail.toLowerCase().includes('deactivated') || detail.toLowerCase().includes('inactive'))) {
          this.deactivatedError.set(true);
        } else {
          this.errorMessage.set(this.i18n.t('auth.invalidCredentials'));
        }
      }
    });
  }
}
