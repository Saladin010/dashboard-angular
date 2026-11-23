import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScansService } from '../../core/services/scans.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { ScanJobDto } from '../../core/models/scan.model';
import { API_CONFIG } from '../../core/config/api.config';

@Component({
  selector: 'app-scans-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="scans-page">
      <div class="page-header">
        <div>
          <h1>{{ i18n.t('scans.title') }}</h1>
          <p>متابعة معالجة الـ 3D Gaussian Splatting وإدارة جلسات Kaggle Worker</p>
        </div>

        <div class="header-actions">
          <input 
            type="text" 
            [(ngModel)]="searchScanId" 
            placeholder="معرف المسح (Scan ID)..." 
            class="input-control scan-input"
          />
          <button class="btn btn-primary" (click)="loadScan(searchScanId)" [disabled]="!searchScanId">
            تحميل المسح
          </button>
        </div>
      </div>

      @if (activeScan(); as scan) {
        <div class="card scan-detail-card">
          <div class="scan-header">
            <div>
              <h3>المسح: {{ scan.id }}</h3>
              <div class="scan-meta">
                <span>النمط: {{ scan.captureMode }}</span> • 
                <span>المحاولة: {{ scan.attemptCount }}</span> • 
                <span>الحالة: </span>
                <span class="badge" [ngClass]="getStatusBadge(scan.status)">{{ scan.status }}</span>
              </div>
            </div>

            <div class="scan-actions">
              @if (authService.isAdmin()) {
                <button 
                  class="btn btn-outline" 
                  (click)="generateKaggleToken(scan.id)"
                  [title]="i18n.t('scans.dispatchToken')"
                >
                  ⚡ {{ i18n.t('scans.dispatchToken') }}
                </button>
              }

              <button 
                class="btn btn-secondary" 
                [disabled]="scan.rawClipsExpired" 
                (click)="retryScan(scan.id)"
                [title]="scan.rawClipsExpired ? i18n.t('scans.rawClipsExpiredNotice') : i18n.t('scans.retryRooms')"
              >
                🔄 {{ i18n.t('scans.retryRooms') }}
              </button>

              <a 
                [href]="getViewerUrl(scan.id)" 
                target="_blank" 
                class="btn btn-primary"
              >
                🎮 {{ i18n.t('scans.studio') }}
              </a>
            </div>
          </div>

          @if (scan.rawClipsExpired) {
            <div class="alert alert-warning">
              ⚠️ {{ i18n.t('scans.rawClipsExpiredNotice') }}
            </div>
          }

          @if (generatedToken()) {
            <div class="alert alert-info token-box">
              <div>
                <strong>توكن معالجة Kaggle Dispatch Token:</strong>
                <code>{{ generatedToken() }}</code>
              </div>
              <button class="btn btn-outline btn-sm" (click)="copyToken()">نسخ</button>
            </div>
          }

          <div class="rooms-section">
            <h4>تقدم معالجة الغرف ({{ scan.rooms.length }} غرف)</h4>
            <div class="rooms-grid">
              @for (room of scan.rooms; track room.id) {
                <div class="room-card card">
                  <div class="room-header">
                    <span class="room-name">{{ room.roomName }}</span>
                    <span class="badge" [ngClass]="getRoomBadge(room.status)">{{ room.status }}</span>
                  </div>
                  
                  <div class="progress-bar-bg">
                    <div 
                      class="progress-bar-fill" 
                      [style.width]="room.status === 'Completed' ? '100%' : (room.status === 'Processing' ? '60%' : '20%')"
                    ></div>
                  </div>

                  @if (room.errorMessage) {
                    <div class="room-error">⚠️ {{ room.errorMessage }}</div>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      } @else {
        <div class="card empty-card">
          <p>أدخل معرف المسح أعلاه أو اختر عقاراً من صفحة العقارات لعرض حالة المعالجة ومراقبة سير عمل الـ 3DGS.</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .scans-page {
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

      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;

        .scan-input {
          width: 280px;
        }
      }
    }

    .scan-detail-card {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;

      .scan-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 1rem;

        h3 {
          font-size: 1.125rem;
          color: var(--text-main, #f8fafc);
        }

        .scan-meta {
          font-size: 0.825rem;
          color: var(--text-muted, #94a3b8);
          margin-top: 0.25rem;
        }

        .scan-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
      }
    }

    .token-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      code {
        display: block;
        font-family: monospace;
        font-size: 0.8rem;
        color: #38bdf8;
        word-break: break-all;
        margin-top: 0.25rem;
      }
    }

    .rooms-section {
      h4 {
        font-size: 0.95rem;
        color: var(--text-main, #f8fafc);
        margin-bottom: 1rem;
      }

      .rooms-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 1rem;

        .room-card {
          background-color: #0f172a;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;

          .room-header {
            display: flex;
            align-items: center;
            justify-content: space-between;

            .room-name {
              font-weight: 700;
              font-size: 0.875rem;
              color: var(--text-main, #f8fafc);
            }
          }

          .progress-bar-bg {
            height: 6px;
            background-color: #334155;
            border-radius: 9999px;
            overflow: hidden;

            .progress-bar-fill {
              height: 100%;
              background-color: #10b981;
              transition: width 0.3s ease;
            }
          }

          .room-error {
            font-size: 0.75rem;
            color: #ef4444;
          }
        }
      }
    }

    .empty-card {
      text-align: center;
      padding: 3rem 1.5rem;
      color: var(--text-muted, #94a3b8);
    }
  `]
})
export class ScansMonitorComponent implements OnInit {
  private readonly scansService = inject(ScansService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);

  searchScanId = '';
  readonly activeScan = signal<ScanJobDto | null>(null);
  readonly generatedToken = signal<string | null>(null);

  ngOnInit(): void {}

  loadScan(id: string): void {
    if (!id) return;
    this.scansService.getScan(id).subscribe({
      next: (scan) => {
        this.activeScan.set(scan);
      },
      error: () => {
        alert('تعذر العثور على المسح المحدد');
      }
    });
  }

  generateKaggleToken(scanId: string): void {
    this.scansService.generateDispatchToken(scanId).subscribe({
      next: (res) => {
        this.generatedToken.set(res.workerToken);
      },
      error: () => {
        alert('حدث خطأ أثناء توليد التوكن');
      }
    });
  }

  retryScan(scanId: string): void {
    this.scansService.retryFailedRooms(scanId).subscribe({
      next: (updated) => {
        this.activeScan.set(updated);
        alert('تمت جدولة إعادة معالجة الغرف بنجاح');
      },
      error: (err) => {
        alert('تعذر إعادة المعالجة: ' + (err?.error?.detail || err?.message));
      }
    });
  }

  copyToken(): void {
    const t = this.generatedToken();
    if (t && navigator.clipboard) {
      navigator.clipboard.writeText(t);
      alert('تم نسخ توكن Kaggle إلى الحافظة');
    }
  }

  getViewerUrl(scanId: string): string {
    return `${API_CONFIG.viewerBaseUrl}/?previewScanId=${scanId}`;
  }

  getStatusBadge(status: string): string {
    switch (status) {
      case 'Completed':
      case 'Published': return 'badge-success';
      case 'Processing':
      case 'Claimed': return 'badge-info';
      case 'Failed': return 'badge-danger';
      default: return 'badge-warning';
    }
  }

  getRoomBadge(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Processing': return 'badge-info';
      case 'Failed': return 'badge-danger';
      default: return 'badge-warning';
    }
  }
}
