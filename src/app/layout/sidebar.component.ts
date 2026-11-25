import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { I18nService } from '../core/services/i18n.service';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    @if (mobileOpen()) {
      <div class="sidebar-overlay" (click)="closeMenu.emit()"></div>
    }
    <aside class="sidebar" [class.mobile-open]="mobileOpen()">
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-icon">3D</div>
          <div class="brand-text">
            <h2>{{ i18n.t('app.title') }}</h2>
            <span>{{ i18n.t('app.subtitle') }}</span>
          </div>
        </div>
        <button type="button" class="mobile-close-btn" (click)="closeMenu.emit()">✕</button>
      </div>

      <nav class="sidebar-nav">
        <a
          routerLink="/dashboard"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          class="nav-link"
          (click)="closeMenu.emit()"
        >
          <span class="nav-item-icon">📊</span>
          <span class="nav-item-label">{{ i18n.t('app.dashboard') }}</span>
        </a>

        <a
          routerLink="/properties"
          routerLinkActive="active"
          class="nav-link"
          (click)="closeMenu.emit()"
        >
          <span class="nav-item-icon">🏢</span>
          <span class="nav-item-label">{{ i18n.t('app.properties') }}</span>
        </a>

        <a
          routerLink="/scans"
          routerLinkActive="active"
          class="nav-link"
          (click)="closeMenu.emit()"
        >
          <span class="nav-item-icon">📸</span>
          <span class="nav-item-label">{{ i18n.t('app.scans') }}</span>
        </a>

        <a
          routerLink="/studio"
          routerLinkActive="active"
          class="nav-link"
          (click)="closeMenu.emit()"
        >
          <span class="nav-item-icon">🎮</span>
          <span class="nav-item-label">{{ i18n.t('scans.studio') }}</span>
        </a>

        @if (authService.isAdmin()) {
          <a
            routerLink="/agents"
            routerLinkActive="active"
            class="nav-link"
            (click)="closeMenu.emit()"
          >
            <span class="nav-item-icon">👥</span>
            <span class="nav-item-label">{{ i18n.t('app.users') }}</span>
          </a>
        }
      </nav>

      <div class="sidebar-footer">
        <div class="user-profile">
          <div class="user-avatar">
            {{ (authService.currentUser()?.fullName || 'U').charAt(0) }}
          </div>
          <div class="user-details">
            <span class="user-name">{{ authService.currentUser()?.fullName }}</span>
            <span class="user-role-badge">
              {{ authService.isAdmin() ? i18n.t('app.admin') : i18n.t('app.agent') }}
            </span>
          </div>
        </div>

        <div class="footer-actions">
          <button type="button" class="btn-lang" (click)="i18n.toggleLanguage()">
            🌐 {{ i18n.currentLang() === 'ar' ? 'English' : 'العربية' }}
          </button>

          <button type="button" class="btn-logout" (click)="logout()" [title]="i18n.t('app.logout')">
            🚪
          </button>
        </div>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 900;
    }

    .sidebar {
      width: 260px;
      height: 100vh;
      background-color: var(--bg-surface, #1e293b);
      border-inline-end: 1px solid var(--border-color, #334155);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      user-select: none;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 1.25rem;
      border-bottom: 1px solid var(--border-color, #334155);
      display: flex;
      align-items: center;
      justify-content: space-between;

      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;

        .brand-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.125rem;
          flex-shrink: 0;
        }

        .brand-text {
          display: flex;
          flex-direction: column;

          h2 {
            font-size: 1rem;
            font-weight: 700;
            color: var(--text-main, #f8fafc);
            line-height: 1.2;
          }

          span {
            font-size: 0.7rem;
            color: var(--text-muted, #94a3b8);
          }
        }
      }
    }

    .mobile-close-btn {
      display: none;
      color: var(--text-muted, #94a3b8);
      font-size: 1.1rem;
      padding: 0.25rem 0.5rem;
    }

    .sidebar-nav {
      flex: 1;
      padding: 1.25rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      overflow-y: auto;

      .nav-link {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        color: var(--text-muted, #94a3b8);
        font-weight: 600;
        font-size: 0.875rem;
        transition: all 0.2s;

        &:hover {
          background-color: rgba(255, 255, 255, 0.04);
          color: var(--text-main, #f8fafc);
        }

        &.active {
          background-color: rgba(16, 185, 129, 0.15);
          color: #34d399;
          font-weight: 700;
        }
      }
    }

    .sidebar-footer {
      padding: 1.25rem;
      border-top: 1px solid var(--border-color, #334155);
      background-color: #162032;
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .user-profile {
        display: flex;
        align-items: center;
        gap: 0.75rem;

        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: #334155;
          color: #10b981;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.875rem;
          border: 1px solid #10b981;
          flex-shrink: 0;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;

          .user-name {
            font-size: 0.825rem;
            font-weight: 700;
            color: var(--text-main, #f8fafc);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .user-role-badge {
            font-size: 0.7rem;
            color: #10b981;
            font-weight: 600;
          }
        }
      }

      .footer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;

        .btn-lang {
          font-size: 0.75rem;
          color: var(--text-muted, #94a3b8);
          padding: 0.35rem 0.65rem;
          border-radius: 0.375rem;
          background-color: #1e293b;
          border: 1px solid #334155;
          &:hover {
            color: #ffffff;
            border-color: #10b981;
          }
        }

        .btn-logout {
          font-size: 1rem;
          color: #ef4444;
          padding: 0.35rem 0.65rem;
          border-radius: 0.375rem;
          background-color: rgba(239, 68, 68, 0.1);
          &:hover {
            background-color: rgba(239, 68, 68, 0.2);
          }
        }
      }
    }

    @media (max-width: 768px) {
      .sidebar-overlay { display: block; }
      .mobile-close-btn { display: inline-flex; }
      .sidebar {
        position: fixed;
        top: 0;
        bottom: 0;
        inset-inline-start: -280px;
        z-index: 950;
        transition: inset-inline-start 0.25s ease;
        &.mobile-open {
          inset-inline-start: 0;
        }
      }
    }
  `]
})
export class SidebarComponent {
  readonly i18n = inject(I18nService);
  readonly authService = inject(AuthService);
  readonly mobileOpen = input(false);
  readonly closeMenu = output<void>();

  logout(): void {
    this.authService.logout().subscribe();
  }
}
