import { Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService } from '../core/services/i18n.service';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="top-header">
      <div class="header-content">
        <div class="header-left">
          <button type="button" class="menu-toggle-btn" (click)="menuToggle.emit()" aria-label="Toggle Menu">
            ☰
          </button>
          <div class="system-status">
            <span class="status-pulse"></span>
            <span class="status-text">RealEstate3D API Live</span>
          </div>
        </div>

        <div class="header-right">
          <button type="button" class="lang-toggle-btn" (click)="i18n.toggleLanguage()">
            {{ i18n.currentLang() === 'ar' ? 'English' : 'العربية' }}
          </button>

          <div class="user-chip">
            <span class="role-tag">{{ authService.isAdmin() ? 'ADMIN' : 'AGENT' }}</span>
            <span class="user-email">{{ authService.currentUser()?.email }}</span>
          </div>
        </div>
      </div>
    </header>
  `,
  styles: [`
    .top-header {
      height: 64px;
      background-color: var(--bg-surface, #1e293b);
      border-bottom: 1px solid var(--border-color, #334155);
      padding: 0 1.25rem;
      display: flex;
      align-items: center;
    }

    .header-content {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .menu-toggle-btn {
      display: none;
      width: 36px;
      height: 36px;
      border-radius: 0.45rem;
      border: 1px solid #334155;
      background: #0f172a;
      color: var(--text-main, #f8fafc);
      font-size: 1.1rem;
      align-items: center;
      justify-content: center;
    }

    .system-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      color: var(--text-muted, #94a3b8);
      font-family: monospace;

      .status-pulse {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #10b981;
        box-shadow: 0 0 8px #10b981;
      }
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;

      .lang-toggle-btn {
        padding: 0.35rem 0.75rem;
        border-radius: 0.375rem;
        background-color: #0f172a;
        border: 1px solid #334155;
        color: var(--text-main, #f8fafc);
        font-size: 0.75rem;
        font-weight: 600;
        &:hover {
          border-color: #10b981;
        }
      }

      .user-chip {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background-color: #0f172a;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        border: 1px solid #334155;

        .role-tag {
          font-size: 0.65rem;
          font-weight: 800;
          color: #10b981;
          letter-spacing: 0.05em;
        }

        .user-email {
          font-size: 0.75rem;
          color: var(--text-muted, #94a3b8);
        }
      }
    }

    @media (max-width: 768px) {
      .menu-toggle-btn { display: inline-flex; }
      .user-email, .status-text { display: none; }
    }
  `]
})
export class HeaderComponent {
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  readonly menuToggle = output<void>();
}
