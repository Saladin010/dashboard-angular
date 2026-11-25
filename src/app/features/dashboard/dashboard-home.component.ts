import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PropertiesService } from '../../core/services/properties.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="dashboard-page">
      <div class="page-header">
        <div>
          <h1>{{ i18n.t('app.dashboard') }}</h1>
          <p>أهلاً بك، {{ authService.currentUser()?.fullName }} ({{ authService.isAdmin() ? i18n.t('app.admin') : i18n.t('app.agent') }})</p>
        </div>

        <div class="header-actions">
          <a routerLink="/properties" class="btn btn-primary">
            + {{ i18n.t('properties.addProperty') }}
          </a>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-icon">🏢</div>
          <div class="metric-info">
            <span class="metric-label">إجمالي العقارات</span>
            <span class="metric-value">{{ totalProperties() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">✅</div>
          <div class="metric-info">
            <span class="metric-label">العقارات النشطة</span>
            <span class="metric-value">{{ activeProperties() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">📝</div>
          <div class="metric-info">
            <span class="metric-label">مسودات قيد التجهيز</span>
            <span class="metric-value">{{ draftProperties() }}</span>
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-icon">👥</div>
          <div class="metric-info">
            <span class="metric-label">الصلاحية</span>
            <span class="metric-value">{{ authService.currentUser()?.role }}</span>
          </div>
        </div>
      </div>

      <div class="dashboard-sections">
        <div class="card">
          <div class="section-title">
            <h3>روابط سريعة</h3>
          </div>
          <div class="quick-links">
            <a routerLink="/properties" class="btn btn-secondary">إدارة عقارات المنصة (CRM)</a>
            <a routerLink="/scans" class="btn btn-secondary">مراقبة معالجة الـ 3D وتوليد توكن Kaggle</a>
            <a routerLink="/studio" class="btn btn-secondary">استوديو التحرير ثلاثي الأبعاد 3D</a>
            @if (authService.isAdmin()) {
              <a routerLink="/agents" class="btn btn-secondary">إدارة المستخدمين وحسابات الوكلاء</a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-page {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;

      h1 {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--text-main, #f8fafc);
      }

      p {
        font-size: 0.875rem;
        color: var(--text-muted, #94a3b8);
      }
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;

      .metric-card {
        background-color: var(--bg-surface, #1e293b);
        border: 1px solid var(--border-color, #334155);
        border-radius: 0.75rem;
        padding: 1.25rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        .metric-icon {
          width: 48px;
          height: 48px;
          background-color: rgba(16, 185, 129, 0.12);
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }

        .metric-info {
          display: flex;
          flex-direction: column;

          .metric-label {
            font-size: 0.75rem;
            color: var(--text-muted, #94a3b8);
            font-weight: 600;
          }

          .metric-value {
            font-size: 1.35rem;
            font-weight: 800;
            color: var(--text-main, #f8fafc);
          }
        }
      }
    }

    .quick-links {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-top: 1rem;
    }
  `]
})
export class DashboardHomeComponent implements OnInit {
  private readonly propertiesService = inject(PropertiesService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  readonly totalProperties = signal(0);
  readonly activeProperties = signal(0);
  readonly draftProperties = signal(0);

  ngOnInit(): void {
    this.propertiesService.getProperties({ pageSize: 1 }).subscribe({
      next: (res) => this.totalProperties.set(res.totalCount),
      error: () => {}
    });

    this.propertiesService.getProperties({ status: 'Active', pageSize: 1 }).subscribe({
      next: (res) => this.activeProperties.set(res.totalCount),
      error: () => {}
    });

    this.propertiesService.getProperties({ status: 'Draft', pageSize: 1 }).subscribe({
      next: (res) => this.draftProperties.set(res.totalCount),
      error: () => {}
    });
  }
}
