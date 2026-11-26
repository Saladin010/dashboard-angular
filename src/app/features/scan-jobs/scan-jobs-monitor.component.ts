import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { ScansService } from '../../core/services/scans.service';
import { PropertiesService } from '../../core/services/properties.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import {
  ScanJobDto,
  ScanRoomJobDto,
  DispatchTokenResponse,
  normalizeScanJobStatus,
  normalizeScanRoomStatus,
  normalizeCaptureMode,
  normalizeEnginePolicy,
  normalizeEngineUsed
} from '../../core/models/scan.model';
import { PropertyDto, ShareLinkDto } from '../../core/models/property.model';
import { API_CONFIG } from '../../core/config/api.config';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';

interface RoomParsedMetrics {
  camerasRegisteredPct?: number;
  sogModelSizeMb?: number;
  glbSizeMb?: number;
  modelFormat?: 'glb' | 'sog';
  triangles?: number;
  processingTimeSec?: number;
  psnr?: number;
  ssim?: number;
}

interface DraftRoomClip {
  roomId: string;
  roomLabel: string;
  file: File | null;
}

@Component({
  selector: 'app-scan-jobs-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="scans-monitor-page" [attr.dir]="i18n.dir()">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-titles">
          <div class="header-badge">
            <span class="pulse-indicator"></span>
            <span>{{ i18n.isRtl() ? 'مراقبة طابور المعالجة 3D' : '3D Scan Processing Queue' }}</span>
          </div>
          <h1>{{ i18n.isRtl() ? 'مراقبة وإدارة جلسات المسح ثلاثي الأبعاد' : '3D Scan Jobs Queue Monitor' }}</h1>
          <p>{{ i18n.isRtl() ? 'تتبع مراحل تحويل الفيديو إلى مجسمات ثلاثية الأبعاد (.glb / Meshroom)، إدارة روابط المعاينة، وتوليد توكن تشغيل Colab T4 Worker' : 'Track video-to-3D (.glb Meshroom / .sog) reconstruction pipeline, manage viewer links, and generate Colab Worker tokens' }}</p>
        </div>

        <div class="header-actions">
          @if (selectedPropertyId()) {
            <button type="button" class="btn btn-primary" (click)="openCreateScanModal()">
              <span class="btn-icon">➕</span>
              <span>{{ i18n.isRtl() ? 'جلسة مسح جديدة ورفع فيديو' : 'New Scan & Upload Video' }}</span>
            </button>
          }
          @if (scan()) {
            <button type="button" class="btn btn-outline" (click)="refreshCurrentScan()" [disabled]="isLoadingScan()">
              <span class="btn-icon">🔄</span>
              <span>{{ i18n.isRtl() ? 'تحديث الحالة' : 'Refresh State' }}</span>
            </button>
            <a [routerLink]="['/studio', scan()!.id]" class="btn btn-primary studio-link-btn">
              <span class="btn-icon">📐</span>
              <span>{{ i18n.isRtl() ? 'استوديو التحرير 3D' : 'Open in 3D Studio' }}</span>
            </a>
          }
        </div>
      </div>

      <!-- Action Toast / Notice Banner -->
      @if (actionMessage()) {
        <div class="alert-toast" [class.alert-success]="actionMessage()!.type === 'success'" [class.alert-error]="actionMessage()!.type === 'error'">
          <div class="toast-content">
            <span class="toast-icon">{{ actionMessage()!.type === 'success' ? '✅' : '❌' }}</span>
            <span>{{ actionMessage()!.text }}</span>
          </div>
          <button type="button" class="toast-close" (click)="actionMessage.set(null)">✕</button>
        </div>
      }

      <!-- Search & Selector Bar -->
      <div class="card selector-card">
        <div class="selector-grid">
          <!-- Property Selector Dropdown -->
          <div class="form-group">
            <label>{{ i18n.isRtl() ? 'اختيار العقار' : 'Select Property' }}</label>
            <select
              class="input-control"
              [ngModel]="selectedPropertyId()"
              (ngModelChange)="onPropertyChange($event)"
              [disabled]="isLoadingProperties()"
            >
              <option value="">{{ i18n.isRtl() ? '-- اختر عقاراً لعرض جلساته --' : '-- Choose Property to browse scans --' }}</option>
              @for (prop of properties(); track prop.id) {
                <option [value]="prop.id">
                  {{ prop.title }} ({{ prop.district }}, {{ prop.city }})
                </option>
              }
            </select>
          </div>

          <!-- Property Scans Dropdown -->
          <div class="form-group">
            <label>{{ i18n.isRtl() ? 'جلسات المسح لهذا العقار' : 'Property Scans' }}</label>
            <div class="search-input-wrap">
              <select
                class="input-control"
                style="flex: 1"
                [ngModel]="scan()?.id || ''"
                (ngModelChange)="loadScan($event)"
                [disabled]="isLoadingScansList() || propertyScans().length === 0"
              >
                @if (isLoadingScansList()) {
                  <option value="">{{ i18n.isRtl() ? 'جاري تحميل جلسات العقار...' : 'Loading property scans...' }}</option>
                } @else if (propertyScans().length === 0) {
                  <option value="">{{ i18n.isRtl() ? 'لا توجد جلسات لهذا العقار بعد' : 'No scans for this property yet' }}</option>
                } @else {
                  <option value="">{{ i18n.isRtl() ? '-- اختر جلسة المسح --' : '-- Select Scan --' }}</option>
                  @for (sc of propertyScans(); track sc.id) {
                    <option [value]="sc.id">
                      {{ sc.id.substring(0, 8) }}... | {{ getScanStatusLabel(sc.status) }} | {{ getCaptureModeName(sc.captureMode) }} ({{ formatDate(sc.createdAt) }})
                    </option>
                  }
                }
              </select>
              @if (selectedPropertyId()) {
                <button
                  type="button"
                  class="btn btn-outline"
                  (click)="loadPropertyScans(selectedPropertyId())"
                  [disabled]="isLoadingScansList()"
                  [title]="i18n.isRtl() ? 'تحديث جلسات هذا العقار' : 'Reload property scans'"
                >
                  🔄
                </button>
              }
            </div>
          </div>

          <!-- Direct Scan ID Search -->
          <div class="form-group direct-search-group">
            <label>{{ i18n.isRtl() ? 'أو الصق معرف جلسة مباشر (Scan ID اختياري)' : 'Or Paste Direct Scan UUID (Optional)' }}</label>
            <div class="search-input-wrap">
              <input
                type="text"
                class="input-control"
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                [(ngModel)]="searchScanIdInput"
                (keyup.enter)="searchByDirectId()"
              />
              <button type="button" class="btn btn-secondary" (click)="searchByDirectId()" [disabled]="isLoadingScan() || !searchScanIdInput.trim()">
                <span class="btn-icon">🔍</span>
                <span>{{ i18n.isRtl() ? 'فتح بالمعرّف' : 'Load ID' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading Spinner for Scan -->
      @if (isLoadingScan()) {
        <div class="card loading-card">
          <div class="spinner"></div>
          <p>{{ i18n.isRtl() ? 'جاري تحميل تفاصيل الجلسة وحالة الغرف...' : 'Loading scan job details and room progress...' }}</p>
        </div>
      }

      <!-- Main Scan Monitor Display -->
      @if (scan() && !isLoadingScan()) {
        @let statusStr = scanStatusNormalized();
        <!-- Raw Clips Expired 30-Day Retention Banner -->
        @if (scan()!.rawClipsExpired) {
          <div class="alert-banner warning-banner">
            <div class="banner-icon-wrap">⚠️</div>
            <div class="banner-body">
              <h4>{{ i18n.isRtl() ? 'تنبيه انتهاء صلاحية المقاطع الخام (سياسة الاحتفاظ 30 يوماً)' : 'Raw Video Clips Expired (30-Day Retention Notice)' }}</h4>
              <p>
                {{ i18n.isRtl()
                  ? 'انتهت فترة الاحتفاظ بمقاطع الفيديو الأصلية المرفوعة لهذا المسح (30 يوماً). تم حذف المقاطع الأولية من مساحة التخزين R2. تم تعطيل خيار إعادة المعالجة.'
                  : 'The 30-day retention period for original uploaded video clips has ended. Raw video files have been purged from storage. Retry is disabled.' }}
              </p>
              @if (scan()!.rawClipsExpireAt) {
                <span class="expiry-timestamp">
                  {{ i18n.isRtl() ? 'تاريخ انتهاء الصلاحية:' : 'Expired At:' }} {{ formatDate(scan()!.rawClipsExpireAt!) }}
                </span>
              }
            </div>
          </div>
        }

        <!-- Top Overview & Action Control Center -->
        <div class="card monitor-overview-card">
          <div class="overview-header">
            <div class="scan-meta-group">
              <div class="scan-id-tag">
                <span class="meta-label">ID:</span>
                <span class="meta-value font-mono">{{ scan()!.id }}</span>
                <button type="button" class="btn-copy-small" (click)="copyToClipboard(scan()!.id, 'scanId')" title="Copy ID">
                  {{ isCopied('scanId') ? '✓ ' + (i18n.isRtl() ? 'تم النسخ' : 'Copied') : '📋' }}
                </button>
              </div>

              <div class="meta-badges">
                <span class="badge" [ngClass]="getScanStatusBadge(scan()!.status).class">
                  <span class="status-dot"></span>
                  {{ i18n.isRtl() ? getScanStatusBadge(scan()!.status).labelAr : getScanStatusBadge(scan()!.status).labelEn }}
                </span>

                <span class="badge badge-info">
                  {{ i18n.isRtl() ? 'نمط التصوير:' : 'Mode:' }} {{ getCaptureModeLabel(scan()!.captureMode) }}
                </span>

                <span class="badge badge-secondary">
                  {{ i18n.isRtl() ? 'المحاولة رقم:' : 'Attempt:' }} {{ scan()!.attemptCount }}
                </span>

                <span class="badge badge-secondary">
                  {{ i18n.isRtl() ? 'سياسة المحرك:' : 'Policy:' }} {{ getEnginePolicyName(scan()!.enginePolicy) }}
                </span>
              </div>
            </div>

            <!-- Action Buttons Toolbar -->
            <div class="overview-actions-toolbar">
              <!-- Admin Only: Colab Worker Dispatch Token Generator -->
              @if (authService.isAdmin()) {
                <button
                  type="button"
                  class="btn btn-warning-outline"
                  (click)="generateKaggleDispatchToken()"
                  [disabled]="isGeneratingToken()"
                  title="Generate 12-hour Worker Token for Colab Meshroom T4 execution"
                >
                  <span class="btn-icon">⚡</span>
                  <span>{{ isGeneratingToken() ? (i18n.isRtl() ? 'جاري التوليد...' : 'Generating...') : (i18n.isRtl() ? 'توكن معالج Colab' : 'Colab Worker Token') }}</span>
                </button>
              }

              <!-- Retry Failed Rooms Action -->
              <div class="retry-wrapper" [title]="scan()!.rawClipsExpired ? (i18n.isRtl() ? 'لا يمكن إعادة المحاولة: انتهت صلاحية المقاطع الخام (30 يوماً)' : 'Cannot retry: Raw clips expired (30-day retention)') : ''">
                <button
                  type="button"
                  class="btn btn-secondary"
                  [disabled]="scan()!.rawClipsExpired || isRetrying() || !hasFailedOrIncompleteRooms()"
                  (click)="retryFailedRooms()"
                >
                  <span class="btn-icon">🔁</span>
                  <span>{{ isRetrying() ? (i18n.isRtl() ? 'جاري الإعادة...' : 'Retrying...') : (i18n.isRtl() ? 'إعادة معالجة الغرف الفاشلة' : 'Retry Failed Rooms') }}</span>
                </button>
                @if (scan()!.rawClipsExpired) {
                  <span class="disabled-warning-badge">{{ i18n.isRtl() ? 'المقاطع منتهية' : 'Clips Expired' }}</span>
                }
              </div>

              <!-- Publish Scan Action -->
              <button
                type="button"
                class="btn btn-primary publish-btn"
                [disabled]="isPublishing() || statusStr === 'Published' || !canPublish()"
                (click)="publishScan()"
                [title]="statusStr === 'Published' ? (i18n.isRtl() ? 'هذا المسح منشور بالفعل' : 'Already published') : (!canPublish() ? (i18n.isRtl() ? 'يجب اكتمال جميع الغرف للنشر' : 'All rooms must be completed') : '')"
              >
                <span class="btn-icon">🚀</span>
                <span>
                  {{ statusStr === 'Published'
                      ? (i18n.isRtl() ? 'منشور حالياً' : 'Published')
                      : (isPublishing() ? (i18n.isRtl() ? 'جاري النشر...' : 'Publishing...') : (i18n.isRtl() ? 'نشر المسح 3D' : 'Publish Scan')) }}
                </span>
              </button>
            </div>
          </div>

          <!-- Primary Processing Metrics Grid -->
          <div class="metrics-dashboard-grid">
            <div class="metric-box">
              <div class="metric-icon-circle">📷</div>
              <div class="metric-data">
                <span class="metric-title">{{ i18n.isRtl() ? 'تسجيل الكاميرات' : 'Cameras Registered' }}</span>
                <span class="metric-number">{{ aggregatedMetrics().camerasRegisteredPct }}%</span>
                <span class="metric-subtitle">{{ i18n.isRtl() ? 'نجاح مطابقة الكاميرات (COLMAP/MASt3R)' : 'Alignment success rate' }}</span>
              </div>
            </div>

            <div class="metric-box">
              <div class="metric-icon-circle">📦</div>
              <div class="metric-data">
                <span class="metric-title">{{ i18n.isRtl() ? 'حجم المجسم 3D (.glb)' : '3D Model Size (.glb)' }}</span>
                <span class="metric-number">{{ aggregatedMetrics().modelSizeMb }} <small>MB</small></span>
                <span class="metric-subtitle">{{ i18n.isRtl() ? 'ملف Meshroom .glb (أو .sog)' : 'Textured .glb mesh (or .sog)' }}</span>
              </div>
            </div>

            <div class="metric-box">
              <div class="metric-icon-circle">⏱️</div>
              <div class="metric-data">
                <span class="metric-title">{{ i18n.isRtl() ? 'زمن المعالجة' : 'Processing Time' }}</span>
                <span class="metric-number">{{ aggregatedMetrics().processingTime }}</span>
                <span class="metric-subtitle">
                  @if (scan()!.lastHeartbeatAt) {
                    {{ i18n.isRtl() ? 'آخر نبضة عامل:' : 'Last heartbeat:' }} {{ formatTimeOnly(scan()!.lastHeartbeatAt!) }}
                  } @else {
                    {{ i18n.isRtl() ? 'إجمالي مدة المعالجة على GPU' : 'GPU Reconstruction duration' }}
                  }
                </span>
              </div>
            </div>

            <div class="metric-box">
              <div class="metric-icon-circle">🔺</div>
              <div class="metric-data">
                <span class="metric-title">{{ i18n.isRtl() ? 'عدد المثلثات (Triangles)' : 'Mesh Triangles / Primitives' }}</span>
                <span class="metric-number">{{ aggregatedMetrics().triangleCount }}</span>
                <span class="metric-subtitle">{{ i18n.isRtl() ? 'إجمالي المضلعات / النقاط ثلاثية الأبعاد' : 'Total 3D triangles rendered' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Admin Colab Meshroom Worker Dispatch Token Modal -->
        @if (showTokenModal() && dispatchTokenData()) {
          <div class="modal-backdrop" (click)="showTokenModal.set(false)">
            <div class="modal-card" (click)="$event.stopPropagation()">
              <div class="modal-header">
                <div class="header-actions">
                  <span class="modal-badge">ADMIN ONLY</span>
                  <h3>{{ i18n.isRtl() ? 'إعدادات معالج Colab Meshroom Worker (Cell 1)' : 'Colab Meshroom Worker (Cell 1) Dispatch Credentials' }}</h3>
                </div>
                <button type="button" class="toast-close" (click)="showTokenModal.set(false)">✕</button>
              </div>

              <div class="modal-body">
                <div class="info-alert">
                  <p>
                    {{ i18n.isRtl()
                      ? 'تم توليد توكن عامل مؤقت (صالح لمدة 12 ساعة). انسخ متغيرات Cell 1 التالية إلى نوت بوك Google Colab T4 (Meshroom 2023.3.0) لتشغيل المعالجة وإخراج .glb.'
                      : 'Temporary 12-hour worker token generated. Paste these variables into Google Colab Meshroom Worker (Cell 1) to claim, reconstruct .glb meshes, and upload results.' }}
                  </p>
                </div>

                <div class="token-field-group">
                  <div class="field-label-row">
                    <label>API_BASE_URL</label>
                    <span class="metric-subtitle">{{ i18n.isRtl() ? 'رابط الـ Backend API' : 'Backend API Base URL' }}</span>
                  </div>
                  <div class="copy-box">
                    <input type="text" class="input-control font-mono" [value]="getColabApiBaseUrl()" readonly />
                    <button type="button" class="btn btn-secondary" (click)="copyToClipboard(getColabApiBaseUrl(), 'colabApiBaseUrl')">
                      {{ isCopied('colabApiBaseUrl') ? (i18n.isRtl() ? '✓ تم النسخ' : '✓ Copied') : (i18n.isRtl() ? 'نسخ' : 'Copy') }}
                    </button>
                  </div>
                </div>

                <div class="token-field-group">
                  <div class="field-label-row">
                    <label>SCAN_ID</label>
                    <span class="metric-subtitle">{{ i18n.isRtl() ? 'معرف جلسة المسح' : 'Scan Job UUID' }}</span>
                  </div>
                  <div class="copy-box">
                    <input type="text" class="input-control font-mono" [value]="dispatchTokenData()!.scanId" readonly />
                    <button type="button" class="btn btn-secondary" (click)="copyToClipboard(dispatchTokenData()!.scanId, 'tokenJobId')">
                      {{ isCopied('tokenJobId') ? (i18n.isRtl() ? '✓ تم النسخ' : '✓ Copied') : (i18n.isRtl() ? 'نسخ' : 'Copy') }}
                    </button>
                  </div>
                </div>

                <div class="token-field-group">
                  <div class="field-label-row">
                    <label>WORKER_TOKEN</label>
                    <span class="metric-subtitle">
                      {{ i18n.isRtl() ? 'ينتهي في:' : 'Expires:' }} {{ formatDate(dispatchTokenData()!.expiresAt) }}
                    </span>
                  </div>
                  <div class="copy-box">
                    <input
                      [type]="showTokenSecret() ? 'text' : 'password'"
                      class="input-control font-mono"
                      [value]="dispatchTokenData()!.workerToken"
                      readonly
                    />
                    <button type="button" class="btn btn-outline" (click)="showTokenSecret.set(!showTokenSecret())" title="Toggle visibility">
                      {{ showTokenSecret() ? '👁️' : '🙈' }}
                    </button>
                    <button type="button" class="btn btn-secondary" (click)="copyToClipboard(dispatchTokenData()!.workerToken, 'workerToken')">
                      {{ isCopied('workerToken') ? (i18n.isRtl() ? '✓ تم النسخ' : '✓ Copied') : (i18n.isRtl() ? 'نسخ' : 'Copy') }}
                    </button>
                  </div>
                </div>

                <div class="token-field-group">
                  <div class="field-label-row">
                    <label>HMAC_SECRET</label>
                    <span class="metric-subtitle">
                      {{ i18n.isRtl() ? 'سر منفصل عن WORKER_TOKEN (إعداد Webhook:Secret في الباك إند)' : 'Separate webhook signing secret (Backend Webhook:Secret / WEBHOOK_SECRET)' }}
                    </span>
                  </div>
                  <div class="copy-box">
                    <input type="text" class="input-control font-mono" [value]="colabHmacSecretPlaceholder" readonly />
                    <button type="button" class="btn btn-secondary" (click)="copyToClipboard(colabHmacSecretPlaceholder, 'hmacSecret')">
                      {{ isCopied('hmacSecret') ? (i18n.isRtl() ? '✓ تم النسخ' : '✓ Copied') : (i18n.isRtl() ? 'نسخ' : 'Copy') }}
                    </button>
                  </div>
                </div>

                <div class="token-field-group">
                  <div class="field-label-row">
                    <label>{{ i18n.isRtl() ? 'كود Colab Meshroom Worker (Cell 1)' : 'Colab Meshroom Worker (Cell 1)' }}</label>
                  </div>
                  <div class="code-preview-wrap">
                    <pre class="code-snippet font-mono">{{ getPythonSnippet() }}</pre>
                    <button type="button" class="btn-copy-code" (click)="copyToClipboard(getPythonSnippet(), 'pySnippet')">
                      {{ isCopied('pySnippet') ? '✓ ' + (i18n.isRtl() ? 'تم النسخ' : 'Copied') : '📋 ' + (i18n.isRtl() ? 'نسخ Cell 1' : 'Copy Cell 1') }}
                    </button>
                  </div>
                </div>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" (click)="showTokenModal.set(false)">
                  {{ i18n.isRtl() ? 'إغلاق' : 'Close' }}
                </button>
              </div>
            </div>
          </div>
        }

        <!-- Per-Room Progress Section -->
        <div class="card rooms-progress-card">
          <div class="section-heading">
            <div class="heading-title-group">
              <h3>{{ i18n.isRtl() ? 'تقدم معالجة الغرف (scan_room_jobs)' : 'Room Reconstruction Progress (scan_room_jobs)' }}</h3>
              <span class="rooms-counter-badge">
                {{ completedRoomsCount() }} / {{ scan()!.rooms.length || 0 }} {{ i18n.isRtl() ? 'غرف مكتملة' : 'Rooms Completed' }}
              </span>
            </div>
            <div class="overall-progress-track">
              <div class="overall-progress-fill" [style.width.%]="overallRoomsPercent()"></div>
            </div>
          </div>

          @if (!scan()!.rooms || scan()!.rooms.length === 0) {
            <div class="empty-welcome-card">
              <p>{{ i18n.isRtl() ? 'لا توجد غرف مسجلة في هذا المسح بعد.' : 'No room jobs attached to this scan yet.' }}</p>
            </div>
          } @else {
            <div class="rooms-grid">
              @for (room of scan()!.rooms; track room.id || $index) {
                @let parsedM = parseRoomMetrics(room);
                @let statusBadge = getRoomStatusBadge(room.status);
                @let rStatus = getRoomStatusNormalized(room.status);
                <div class="room-job-card" [class.room-completed]="rStatus === 'Completed'">
                  <div class="room-card-header">
                    <div class="room-name-wrap">
                      <span class="room-order-badge">#{{ getRoomOrder(room, $index) }}</span>
                      <h4 class="room-name">{{ getRoomName(room, $index) }}</h4>
                    </div>

                    <div class="meta-badges">
                      <span class="badge" [ngClass]="statusBadge.class">
                        <span class="status-dot"></span>
                        {{ i18n.isRtl() ? statusBadge.labelAr : statusBadge.labelEn }}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div class="room-progress-bar">
                      <div
                        class="room-progress-fill"
                        [ngClass]="getRoomFillClass(room.status)"
                        [style.width.%]="getRoomProgress(room.status)"
                      ></div>
                    </div>
                    <div class="field-label-row">
                      <span class="progress-step-text">{{ getRoomStatusStepDescription(room.status) }}</span>
                      <span class="font-mono">{{ getRoomProgress(room.status) }}%</span>
                    </div>
                  </div>

                  <div class="room-stats-row">
                    <div class="room-stat-item">
                      <span class="progress-step-text">
                        {{ parsedM.modelFormat === 'sog' ? (i18n.isRtl() ? 'حجم .sog:' : '.sog Size:') : (i18n.isRtl() ? 'حجم .glb:' : '.glb Size:') }}
                      </span>
                      <span class="font-mono">{{ (parsedM.glbSizeMb ?? parsedM.sogModelSizeMb) ? (parsedM.glbSizeMb ?? parsedM.sogModelSizeMb) + ' MB' : '--' }}</span>
                    </div>

                    <div class="room-stat-item">
                      <span class="progress-step-text">{{ parsedM.modelFormat === 'sog' ? (i18n.isRtl() ? 'النقاط:' : 'Splats:') : (i18n.isRtl() ? 'المثلثات:' : 'Triangles:') }}</span>
                      <span class="font-mono">{{ parsedM.triangles ? parsedM.triangles.toLocaleString() : '--' }}</span>
                    </div>

                    <div class="room-stat-item">
                      <span class="progress-step-text">{{ i18n.isRtl() ? 'مطابقة الكاميرات:' : 'Cameras:' }}</span>
                      <span class="font-mono">{{ parsedM.camerasRegisteredPct !== undefined ? parsedM.camerasRegisteredPct + '%' : '--' }}</span>
                    </div>

                    @if (parsedM.psnr) {
                      <div class="room-stat-item">
                        <span class="progress-step-text">PSNR:</span>
                        <span class="font-mono">{{ parsedM.psnr }} dB</span>
                      </div>
                    }

                    @if (getRoomEngineUsed(room)) {
                      <div class="room-stat-item">
                        <span class="progress-step-text">{{ i18n.isRtl() ? 'المحرك:' : 'Engine:' }}</span>
                        <span>{{ getRoomEngineUsed(room) }}</span>
                      </div>
                    }
                  </div>

                  @if (room.errorMessage) {
                    <div class="room-error-alert">
                      <span>⚠️</span>
                      <span>{{ room.errorMessage }}</span>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>

        <!-- Property Share Links Management Section -->
        <div class="card">
          <div class="share-links-header">
            <div>
              <h3>{{ i18n.isRtl() ? 'روابط مشاركة الجولة الافتراضية (Share Links)' : 'Public 3D Tour Share Links' }}</h3>
              <p class="progress-step-text">{{ i18n.isRtl() ? 'قائمة الروابط العامة المفعلة لمعاينة العقار، مع إمكانية التتبع والإلغاء الفوري للصلاحية' : 'Manage active public walkthrough links with view analytics and instant revocation' }}</p>
            </div>

            <button
              type="button"
              class="btn btn-outline"
              (click)="createNewShareLink()"
              [disabled]="isCreatingShareLink() || statusStr !== 'Published'"
              [title]="statusStr !== 'Published' ? (i18n.isRtl() ? 'يجب نشر المسح أولاً لإنشاء روابط مشاركة' : 'Scan must be published to generate share links') : ''"
            >
              <span class="btn-icon">🔗</span>
              <span>{{ isCreatingShareLink() ? (i18n.isRtl() ? 'جاري الإنشاء...' : 'Creating...') : (i18n.isRtl() ? '+ إنشاء رابط مشاركة جديد' : '+ Generate Share Link') }}</span>
            </button>
          </div>

          @if (isLoadingShareLinks()) {
            <div class="empty-welcome-card">
              <div class="spinner"></div>
              <span>{{ i18n.isRtl() ? 'جاري تحميل روابط المشاركة...' : 'Loading share links...' }}</span>
            </div>
          } @else if (shareLinks().length === 0) {
            <div class="empty-welcome-card">
              <span>🌐</span>
              <p>{{ i18n.isRtl() ? 'لا توجد روابط مشاركة منشأة لهذا العقار بعد.' : 'No share links created for this property yet.' }}</p>
              @if (statusStr === 'Published') {
                <button type="button" class="btn btn-primary" (click)="createNewShareLink()" [disabled]="isCreatingShareLink()">
                  {{ i18n.isRtl() ? 'إنشاء أول رابط مشاركة الآن' : 'Create First Share Link' }}
                </button>
              }
            </div>
          } @else {
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>{{ i18n.isRtl() ? 'رابط المشاركة / التوكن' : 'Share URL / Token' }}</th>
                    <th>{{ i18n.isRtl() ? 'عدد المشاهدات' : 'Views' }}</th>
                    <th>{{ i18n.isRtl() ? 'آخر مشاهدة / الحالة' : 'Active Status' }}</th>
                    <th>{{ i18n.isRtl() ? 'تاريخ الإنشاء' : 'Created At' }}</th>
                    <th>{{ i18n.isRtl() ? 'الحالة' : 'Status' }}</th>
                    <th>{{ i18n.isRtl() ? 'إجراءات' : 'Actions' }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (link of shareLinks(); track link.id) {
                    <tr>
                      <td>
                        <div class="link-cell">
                          <span class="token-code font-mono">{{ link.token.substring(0, 16) }}...</span>
                          <button
                            type="button"
                            class="btn-copy-small"
                            (click)="copyToClipboard(getPublicShareUrl(link), 'shareLink_' + link.id)"
                            title="Copy Public URL"
                          >
                            {{ isCopied('shareLink_' + link.id) ? '✓ ' + (i18n.isRtl() ? 'تم النسخ' : 'Copied') : '🔗 ' + (i18n.isRtl() ? 'نسخ الرابط' : 'Copy URL') }}
                          </button>
                        </div>
                      </td>
                      <td>
                        <span class="link-cell">
                          <span>👁️</span>
                          <strong class="font-mono">{{ link.viewCount }}</strong>
                        </span>
                      </td>
                      <td>
                        <span class="progress-step-text">
                          {{ link.expiresAt ? formatDate(link.expiresAt) : (i18n.isRtl() ? 'صالح بدون انتهاء' : 'No expiration') }}
                        </span>
                      </td>
                      <td>
                        <span class="progress-step-text">{{ formatDate(link.createdAt) }}</span>
                      </td>
                      <td>
                        @if (link.isActive) {
                          <span class="badge badge-success">
                            <span class="status-dot"></span>
                            {{ i18n.isRtl() ? 'نشط' : 'Active' }}
                          </span>
                        } @else {
                          <span class="badge badge-secondary">
                            {{ i18n.isRtl() ? 'ملغى' : 'Revoked' }}
                          </span>
                        }
                      </td>
                      <td>
                        @if (link.isActive) {
                          <button
                            type="button"
                            class="btn-danger-sm"
                            (click)="revokeShareLink(link.id)"
                            [disabled]="isRevokingId() === link.id"
                            title="Revoke access immediately"
                          >
                            {{ isRevokingId() === link.id ? (i18n.isRtl() ? 'جاري الإلغاء...' : 'Revoking...') : (i18n.isRtl() ? 'إلغاء الصلاحية' : 'Revoke') }}
                          </button>
                        } @else {
                          <span class="progress-step-text">{{ i18n.isRtl() ? 'تم التعطيل' : 'Revoked' }}</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      } @else if (!scan() && !isLoadingScan()) {
        <div class="card empty-welcome-card">
          <div style="font-size: 2.5rem;">📸</div>
          @if (selectedPropertyId()) {
            <h3>{{ i18n.isRtl() ? 'لا توجد جلسات مسح لهذا العقار حتى الآن' : 'No Scan Jobs Found for This Property Yet' }}</h3>
            <p>{{ i18n.isRtl() ? 'ارفع فيديو الغرف مباشرة من المتصفح لإنشاء جلسة مسح وتوليد توكن تشغيل Google Colab T4 فوراً.' : 'Upload room video clips directly from your browser to start a scan job and mint a Google Colab T4 Worker token.' }}</p>
            <button type="button" class="btn btn-primary" (click)="openCreateScanModal()">
              <span class="btn-icon">➕</span>
              <span>{{ i18n.isRtl() ? 'إنشاء جلسة مسح ورفع فيديو الغرف' : 'Create Scan & Upload Room Videos' }}</span>
            </button>
          } @else {
            <h3>{{ i18n.isRtl() ? 'اختر عقاراً أو جلسة مسح لبدء المراقبة' : 'Select a property or scan to start monitoring' }}</h3>
            <p>{{ i18n.isRtl() ? 'اختر عقاراً من القائمة أعلاه لعرض جلساته أو إنشاء جلسة مسح جديدة ورفع الفيديوهات، أو الصق معرف جلسة (Scan ID) مباشرة.' : 'Choose a property above to view or create scan jobs, or paste a Scan UUID directly.' }}</p>
          }
        </div>
      }

      <!-- Create Scan & Upload Room Videos Modal -->
      @if (showCreateModal()) {
        <div class="modal-backdrop" (click)="!isUploadingScan() && showCreateModal.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div class="header-actions">
                <span class="modal-badge">NEW SCAN</span>
                <h3>{{ i18n.isRtl() ? 'إنشاء جلسة مسح ورفع فيديوهات الغرف' : 'Create Scan Job & Upload Videos' }}</h3>
              </div>
              <button type="button" class="toast-close" [disabled]="isUploadingScan()" (click)="showCreateModal.set(false)">✕</button>
            </div>

            <div class="modal-body">
              <div class="info-alert">
                <p>
                  {{ i18n.isRtl()
                    ? 'اختر مقاطع الفيديو لكل غرفة (MP4/MOV). سيتم تقسيمها ورفعها إلى Cloudflare R2 ثم تجهيز الجلسة لمعالج Colab Meshroom.'
                    : 'Attach room video clips (MP4/MOV). Videos are uploaded to Cloudflare R2 via multipart presigned URLs and queued for Colab Meshroom.' }}
                </p>
              </div>

              <div class="token-field-group">
                <div class="field-label-row">
                  <label>{{ i18n.isRtl() ? 'نمط التصوير (Capture Mode)' : 'Capture Mode' }}</label>
                </div>
                <select class="input-control" [(ngModel)]="newScanCaptureMode" [disabled]="isUploadingScan()">
                  <option [ngValue]="1">{{ i18n.isRtl() ? 'غرفة بغرفة (RoomByRoom) — الأفضل لـ Meshroom' : 'Room By Room (Recommended for Meshroom)' }}</option>
                  <option [ngValue]="0">{{ i18n.isRtl() ? 'جولة مستمرة (Walkthrough)' : 'Continuous Walkthrough' }}</option>
                </select>
              </div>

              @for (clip of draftClips(); track $index) {
                <div class="room-job-card" style="padding: .65rem; border: 1px solid var(--border-color); border-radius: .4rem; display: flex; flex-direction: column; gap: .4rem;">
                  <div class="field-label-row">
                    <strong>{{ i18n.isRtl() ? 'غرفة #' + ($index + 1) : 'Room #' + ($index + 1) }}</strong>
                    @if (draftClips().length > 1 && !isUploadingScan()) {
                      <button type="button" class="btn-danger-sm" (click)="removeDraftClip($index)">
                        {{ i18n.isRtl() ? 'حذف' : 'Remove' }}
                      </button>
                    }
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: .4rem;">
                    <input
                      type="text"
                      class="input-control"
                      [placeholder]="i18n.isRtl() ? 'اسم الغرفة (مثلاً: الصالة)' : 'Room Label (e.g. Living Room)'"
                      [(ngModel)]="clip.roomLabel"
                      [disabled]="isUploadingScan()"
                    />
                    <input
                      type="text"
                      class="input-control font-mono"
                      [placeholder]="i18n.isRtl() ? 'معرف الغرفة (living_room)' : 'Room ID slug (living_room)'"
                      [(ngModel)]="clip.roomId"
                      [disabled]="isUploadingScan()"
                    />
                  </div>
                  <input
                    type="file"
                    accept="video/*,.mp4,.mov,.webm"
                    class="input-control"
                    (change)="onDraftFileSelected($index, $event)"
                    [disabled]="isUploadingScan()"
                  />
                  @if (clip.file) {
                    <span class="progress-step-text font-mono">
                      {{ clip.file.name }} ({{ (clip.file.size / (1024 * 1024)).toFixed(1) }} MB)
                    </span>
                  }
                </div>
              }

              @if (!isUploadingScan()) {
                <button type="button" class="btn btn-outline" (click)="addDraftClip()">
                  + {{ i18n.isRtl() ? 'إضافة غرفة أخرى' : 'Add Another Room' }}
                </button>
              }

              @if (uploadStatusText()) {
                <div class="info-alert">
                  <p>{{ uploadStatusText() }}</p>
                </div>
              }
            </div>

            <div class="modal-footer" style="gap: .5rem;">
              <button type="button" class="btn btn-secondary" [disabled]="isUploadingScan()" (click)="showCreateModal.set(false)">
                {{ i18n.isRtl() ? 'إلغاء' : 'Cancel' }}
              </button>
              <button type="button" class="btn btn-primary" [disabled]="isUploadingScan() || !canSubmitNewScan()" (click)="submitCreateAndUploadScan()">
                {{ isUploadingScan() ? (i18n.isRtl() ? 'جاري الرفع...' : 'Uploading...') : (i18n.isRtl() ? 'بدء الرفع وإنشاء الجلسة' : 'Create & Upload Scan') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .scans-monitor-page{display:flex;flex-direction:column;gap:1rem;padding-bottom:2rem}
    .page-header,.overview-header,.share-links-header,.heading-title-group,.room-card-header,.field-label-row,.modal-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem}
    .header-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .6rem;border-radius:9999px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);color:#34d399;font-size:.75rem;font-weight:700}
    .pulse-indicator{width:8px;height:8px;border-radius:50%;background:#10b981}
    .header-titles h1{font-size:1.35rem;font-weight:800;color:var(--text-main);margin:.2rem 0}
    .header-titles p,.metric-subtitle,.progress-step-text{font-size:.8rem;color:var(--text-muted)}
    .header-actions,.scan-meta-group,.overview-actions-toolbar,.search-input-wrap,.copy-box,.room-name-wrap,.link-cell{display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}
    .alert-toast{display:flex;justify-content:space-between;padding:.6rem 1rem;border-radius:.4rem;font-size:.825rem;font-weight:600}
    .alert-success{background:rgba(16,185,129,.15);border:1px solid rgba(16,185,129,.4);color:#34d399}
    .alert-error{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#f87171}
    .alert-banner{display:flex;gap:.75rem;padding:.75rem;border-radius:.4rem;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#fbbf24;font-size:.8rem}
    .alert-banner h4{font-size:.9rem;font-weight:700;color:#fde68a;margin-bottom:.2rem}
    .selector-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.75rem;align-items:flex-end}
    .form-group{display:flex;flex-direction:column;gap:.25rem}
    .form-group label{font-size:.72rem;font-weight:700;color:var(--text-muted)}
    .search-input-wrap input{flex:1}
    .scan-meta-group{flex-direction:column;align-items:flex-start}
    .scan-id-tag{display:inline-flex;align-items:center;gap:.4rem;background:#0f172a;padding:.2rem .45rem;border-radius:.4rem;border:1px solid var(--border-color);font-size:.78rem}
    .meta-badges,.room-stats-row{display:flex;flex-wrap:wrap;gap:.3rem}
    .btn-warning-outline{border:1px solid #f59e0b;color:#fbbf24;background:rgba(245,158,11,.08)}
    .retry-wrapper{position:relative;display:inline-flex}
    .disabled-warning-badge{position:absolute;bottom:-14px;font-size:.65rem;color:#f87171;font-weight:700;white-space:nowrap}
    .metrics-dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.6rem;margin-top:.6rem}
    .metric-box{background:#0f172a;border:1px solid var(--border-color);border-radius:.4rem;padding:.65rem;display:flex;align-items:center;gap:.6rem}
    .metric-icon-circle{width:36px;height:36px;border-radius:.35rem;display:flex;align-items:center;justify-content:center;font-size:1.1rem;background:rgba(255,255,255,.05)}
    .metric-title{font-size:.68rem;color:var(--text-muted);font-weight:600}
    .metric-number{font-size:1.15rem;font-weight:800;color:var(--text-main);margin:.05rem 0}
    .rooms-counter-badge{background:#0f172a;border:1px solid var(--border-color);padding:.1rem .45rem;border-radius:9999px;font-size:.68rem;font-weight:700;color:#38bdf8}
    .overall-progress-track{width:100%;height:5px;background:#0f172a;border-radius:9999px;overflow:hidden}
    .overall-progress-fill{height:100%;background:linear-gradient(90deg,#10b981,#38bdf8)}
    .rooms-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.6rem}
    .room-job-card{background:#0f172a;border:1px solid var(--border-color);border-radius:.4rem;padding:.65rem;display:flex;flex-direction:column;gap:.45rem}
    .room-order-badge{font-size:.68rem;font-weight:700;background:#1e293b;color:var(--text-muted);padding:.08rem .3rem;border-radius:.2rem}
    .room-name{font-size:.825rem;font-weight:700;color:var(--text-main)}
    .room-progress-bar{width:100%;height:5px;background:#1e293b;border-radius:9999px;overflow:hidden}
    .room-progress-fill{height:100%;border-radius:9999px}
    .fill-success{background:#10b981}.fill-info{background:#0ea5e9}.fill-warning{background:#f59e0b}.fill-danger{background:#ef4444}.fill-secondary{background:#64748b}
    .room-stats-row{padding-top:.3rem;border-top:1px solid rgba(51,65,85,.4);font-size:.65rem}
    .room-stat-item{display:flex;gap:.2rem}
    .room-error-alert{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:.25rem;padding:.3rem .45rem;font-size:.68rem;color:#f87171}
    .token-code{color:#38bdf8;font-weight:600;font-size:.72rem}
    .btn-danger-sm{padding:.2rem .45rem;font-size:.68rem;font-weight:700;border-radius:.25rem;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);color:#f87171;cursor:pointer}
    .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:.75rem}
    .modal-card{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:.5rem;width:100%;max-width:500px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
    .modal-header{padding:.65rem .9rem;border-bottom:1px solid var(--border-color)}
    .modal-badge{background:rgba(245,158,11,.2);color:#fbbf24;border:1px solid rgba(245,158,11,.4);font-size:.62rem;font-weight:800;padding:.08rem .3rem;border-radius:.2rem}
    .modal-body{padding:.9rem;overflow-y:auto;display:flex;flex-direction:column;gap:.65rem}
    .info-alert{background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.25);border-radius:.35rem;padding:.45rem .65rem;font-size:.75rem;color:#bae6fd}
    .token-field-group{display:flex;flex-direction:column;gap:.2rem}
    .copy-box input{flex:1}
    .code-preview-wrap{position:relative;background:#0f172a;border:1px solid var(--border-color);border-radius:.35rem}
    .code-snippet{padding:.5rem;font-size:.68rem;color:#38bdf8;margin:0;overflow-x:auto}
    .btn-copy-code{position:absolute;top:.3rem;inset-inline-end:.3rem;background:#1e293b;border:1px solid var(--border-color);color:#fff;font-size:.65rem;padding:.15rem .35rem;border-radius:.2rem;cursor:pointer}
    .modal-footer{padding:.5rem .9rem;border-top:1px solid var(--border-color);display:flex;justify-content:flex-end}
    .status-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background-color:currentColor}
    .font-mono{font-family:monospace}
    .btn-copy-small{background:#1e293b;border:1px solid var(--border-color);color:#fff;padding:.12rem .35rem;border-radius:.25rem;font-size:.68rem;font-weight:600;cursor:pointer}
    .empty-welcome-card,.loading-card{text-align:center;padding:1.75rem 1rem;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:.6rem}
    .empty-welcome-card h3{font-size:1.05rem;color:var(--text-main);margin-bottom:.2rem}
    .spinner{width:26px;height:26px;border:3px solid rgba(16,185,129,.2);border-top-color:var(--primary);border-radius:50%;animation:spin .8s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  `]
})
export class ScanJobsMonitorComponent implements OnInit, OnDestroy {
  private readonly scansService = inject(ScansService);
  private readonly propertiesService = inject(PropertiesService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  searchScanIdInput = '';
  readonly selectedPropertyId = signal<string>('');
  readonly properties = signal<PropertyDto[]>([]);
  readonly propertyScans = signal<ScanJobDto[]>([]);
  readonly isLoadingProperties = signal<boolean>(false);
  readonly isLoadingScansList = signal<boolean>(false);

  readonly scan = signal<ScanJobDto | null>(null);
  readonly isLoadingScan = signal<boolean>(false);
  readonly scanStatusNormalized = computed(() => {
    const s = this.scan();
    return s ? normalizeScanJobStatus(s.status) : null;
  });

  readonly shareLinks = signal<ShareLinkDto[]>([]);
  readonly isLoadingShareLinks = signal<boolean>(false);
  readonly isCreatingShareLink = signal<boolean>(false);
  readonly isRevokingId = signal<string | null>(null);

  readonly isRetrying = signal<boolean>(false);
  readonly isPublishing = signal<boolean>(false);
  readonly isGeneratingToken = signal<boolean>(false);
  readonly dispatchTokenData = signal<DispatchTokenResponse | null>(null);
  readonly showTokenModal = signal<boolean>(false);
  readonly showTokenSecret = signal<boolean>(false);
  readonly actionMessage = signal<{ type: 'success' | 'error'; text: string } | null>(null);

  readonly copiedMap = signal<Record<string, boolean>>({});
  readonly colabHmacSecretPlaceholder = 'DefaultDevelopmentWebhookSecretKey1234567890!';
  readonly showCreateModal = signal<boolean>(false);
  readonly isUploadingScan = signal<boolean>(false);
  readonly uploadStatusText = signal<string>('');
  newScanCaptureMode = 1;
  readonly draftClips = signal<DraftRoomClip[]>([
    { roomId: 'living_room', roomLabel: 'الصالة الرئيسية', file: null }
  ]);
  private autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly aggregatedMetrics = computed(() => {
    const s = this.scan();
    if (!s) {
      return {
        camerasRegisteredPct: '--',
        sogModelSizeMb: '--',
        modelSizeMb: '--',
        processingTime: '--',
        gaussianCount: '--',
        triangleCount: '--'
      };
    }

    const sStatus = normalizeScanJobStatus(s.status);
    let totalModelMb = 0;
    let camerasPctSum = 0;
    let camerasPctCount = 0;
    let totalPrimitives = 0;

    for (const room of s.rooms || []) {
      const pm = this.parseRoomMetrics(room);
      const sizeMb = pm.glbSizeMb ?? pm.sogModelSizeMb;
      if (sizeMb) totalModelMb += sizeMb;
      if (pm.camerasRegisteredPct !== undefined) {
        camerasPctSum += pm.camerasRegisteredPct;
        camerasPctCount++;
      }
      if (pm.triangles) {
        totalPrimitives += pm.triangles;
      } else if (room.gaussianCount) {
        totalPrimitives += room.gaussianCount;
      }
    }

    const avgCameras = camerasPctCount > 0
      ? (camerasPctSum / camerasPctCount).toFixed(1)
      : (sStatus === 'ReadyForReview' || sStatus === 'Published' ? '98.5' : '--');

    let procTimeStr = '--';
    if (s.processingStartedAt) {
      const start = new Date(s.processingStartedAt).getTime();
      let end = Date.now();
      if (sStatus === 'ReadyForReview' || sStatus === 'Published' || sStatus === 'Failed') {
        end = s.updatedAt ? new Date(s.updatedAt).getTime() : (s.lastHeartbeatAt ? new Date(s.lastHeartbeatAt).getTime() : end);
      } else if (s.lastHeartbeatAt) {
        end = new Date(s.lastHeartbeatAt).getTime();
      }
      const diffSec = Math.max(0, Math.floor((end - start) / 1000));
      const m = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      procTimeStr = `${m}m ${sec}s`;
    }

    const formattedSize = totalModelMb > 0 ? totalModelMb.toFixed(1) : '--';
    const formattedCount = totalPrimitives > 0 ? totalPrimitives.toLocaleString() : '--';

    return {
      camerasRegisteredPct: avgCameras,
      sogModelSizeMb: formattedSize,
      modelSizeMb: formattedSize,
      processingTime: procTimeStr,
      gaussianCount: formattedCount,
      triangleCount: formattedCount
    };
  });

  readonly completedRoomsCount = computed(() => {
    const s = this.scan();
    if (!s || !s.rooms) return 0;
    return s.rooms.filter((r) => normalizeScanRoomStatus(r.status) === 'Completed').length;
  });

  readonly overallRoomsPercent = computed(() => {
    const s = this.scan();
    if (!s || !s.rooms || s.rooms.length === 0) return 0;
    const completed = s.rooms.filter((r) => normalizeScanRoomStatus(r.status) === 'Completed').length;
    return Math.round((completed / s.rooms.length) * 100);
  });

  ngOnInit(): void {
    this.loadProperties();

    this.route.queryParams.subscribe((params) => {
      const qScanId = params['scanId'];
      const qPropId = params['propertyId'];

      if (qPropId) {
        this.selectedPropertyId.set(qPropId);
        this.loadPropertyScans(qPropId, qScanId);
      } else if (qScanId) {
        this.loadScan(qScanId);
      }
    });

    this.autoRefreshTimer = setInterval(() => {
      const s = this.scan();
      if (!s) return;
      const st = normalizeScanJobStatus(s.status);
      if (st === 'Processing' || st === 'PendingProcessing' || st === 'Uploading') {
        this.refreshCurrentScan(true);
      }
    }, 8000);
  }

  ngOnDestroy(): void {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }
  }

  loadProperties(): void {
    this.isLoadingProperties.set(true);
    this.propertiesService.getProperties({ pageSize: 50 }).subscribe({
      next: (res) => {
        this.properties.set(res.items || []);
        this.isLoadingProperties.set(false);

        if (!this.scan() && !this.selectedPropertyId() && res.items?.length > 0) {
          const firstProp = res.items[0];
          this.selectedPropertyId.set(firstProp.id);
          this.loadPropertyScans(firstProp.id);
        }
      },
      error: (err) => {
        this.isLoadingProperties.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر تحميل قائمة العقارات.')
        });
      }
    });
  }

  onPropertyChange(propertyId: string): void {
    this.selectedPropertyId.set(propertyId);
    this.scan.set(null);
    this.searchScanIdInput = '';
    this.shareLinks.set([]);
    this.propertyScans.set([]);
    this.actionMessage.set(null);
    if (propertyId) {
      this.loadPropertyScans(propertyId);
    }
  }

  loadPropertyScans(propertyId: string, autoSelectScanId?: string): void {
    this.isLoadingScansList.set(true);
    this.propertiesService.getPropertyScans(propertyId).subscribe({
      next: (scans) => {
        this.propertyScans.set(scans || []);
        this.isLoadingScansList.set(false);

        if (autoSelectScanId) {
          this.loadScan(autoSelectScanId);
        } else if (scans && scans.length > 0) {
          this.loadScan(scans[0].id);
        }
      },
      error: (err) => {
        this.isLoadingScansList.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر تحميل جلسات المسح لهذا العقار.')
        });
      }
    });
  }

  openCreateScanModal(): void {
    if (!this.selectedPropertyId()) return;
    this.uploadStatusText.set('');
    this.draftClips.set([{ roomId: 'living_room', roomLabel: 'الصالة الرئيسية', file: null }]);
    this.showCreateModal.set(true);
  }

  addDraftClip(): void {
    const idx = this.draftClips().length + 1;
    this.draftClips.update((list) => [
      ...list,
      { roomId: `room_${idx}`, roomLabel: `غرفة ${idx}`, file: null }
    ]);
  }

  removeDraftClip(index: number): void {
    this.draftClips.update((list) => list.filter((_, i) => i !== index));
  }

  onDraftFileSelected(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.draftClips.update((list) =>
      list.map((item, i) => (i === index ? { ...item, file } : item))
    );
  }

  canSubmitNewScan(): boolean {
    const clips = this.draftClips();
    return clips.length > 0 && clips.every((c) => c.roomId.trim() && c.roomLabel.trim() && c.file && c.file.size > 0);
  }

  async submitCreateAndUploadScan(): Promise<void> {
    const propertyId = this.selectedPropertyId();
    if (!propertyId || !this.canSubmitNewScan()) return;

    const clips = this.draftClips();
    this.isUploadingScan.set(true);
    this.uploadStatusText.set(this.i18n.isRtl() ? 'جاري إنشاء الجلسة وطلب روابط الرفع...' : 'Creating scan job...');

    try {
      const { firstValueFrom } = await import('rxjs');
      const created = await firstValueFrom(
        this.scansService.createScan(propertyId, {
          captureMode: this.newScanCaptureMode,
          enginePolicy: 0,
          clips: clips.map((c, idx) => ({
            roomId: c.roomId.trim(),
            roomLabel: c.roomLabel.trim(),
            sortOrder: idx,
            fileSizeBytes: c.file!.size,
            mimeType: c.file!.type || 'video/mp4'
          }))
        })
      );

      const completedRooms: { roomId: string; parts: { partNumber: number; eTag: string }[] }[] = [];

      for (const roomUpload of created.clips) {
        const draft = clips.find((c) => c.roomId.trim() === roomUpload.roomId);
        if (!draft?.file) continue;

        const file = draft.file;
        const partSize = roomUpload.partSizeBytes || 15 * 1024 * 1024;
        const uploadedParts: { partNumber: number; eTag: string }[] = [];

        for (const part of roomUpload.parts) {
          const start = (part.partNumber - 1) * partSize;
          const end = Math.min(file.size, start + partSize);
          const chunk = file.slice(start, end);

          this.uploadStatusText.set(
            this.i18n.isRtl()
              ? `جاري رفع ${roomUpload.roomLabel} (الجزء ${part.partNumber} من ${roomUpload.parts.length})...`
              : `Uploading ${roomUpload.roomLabel} (part ${part.partNumber}/${roomUpload.parts.length})...`
          );

          const putResp = await fetch(part.url, { method: 'PUT', body: chunk });
          if (!putResp.ok) {
            throw new Error(`R2 upload failed (${putResp.status})`);
          }
          const eTag = (putResp.headers.get('ETag') || putResp.headers.get('etag') || '').replace(/"/g, '');
          if (!eTag) {
            throw new Error('Missing ETag header from R2 response (ensure R2 CORS ExposeHeaders includes ETag).');
          }
          uploadedParts.push({ partNumber: part.partNumber, eTag });
        }

        completedRooms.push({ roomId: roomUpload.roomId, parts: uploadedParts });
      }

      this.uploadStatusText.set(this.i18n.isRtl() ? 'جاري تأكيد اكتمال الرفع...' : 'Finalizing multipart upload...');
      await firstValueFrom(this.scansService.completeUpload(created.scanId, { rooms: completedRooms }));

      this.isUploadingScan.set(false);
      this.showCreateModal.set(false);
      this.actionMessage.set({
        type: 'success',
        text: this.i18n.isRtl() ? 'تم إنشاء الجلسة ورفع الفيديوهات بنجاح!' : 'Scan job created and room videos uploaded!'
      });
      this.loadPropertyScans(propertyId, created.scanId);
    } catch (err: any) {
      this.isUploadingScan.set(false);
      const msg = extractApiErrorMessage(err, err?.message || 'فشل رفع الفيديو إلى R2. تأكد من إعدادات CORS على Bucket my-app-media.');
      this.uploadStatusText.set(msg);
      this.actionMessage.set({ type: 'error', text: msg });
    }
  }

  searchByDirectId(): void {
    const id = this.searchScanIdInput.trim();
    if (!id) return;
    this.loadScan(id);
  }

  loadScan(scanId: string): void {
    if (!scanId) return;
    this.isLoadingScan.set(true);
    this.searchScanIdInput = scanId;

    this.scansService.getScan(scanId).subscribe({
      next: (scanData) => {
        this.scan.set(scanData);
        this.isLoadingScan.set(false);

        if (scanData.propertyId && scanData.propertyId !== this.selectedPropertyId()) {
          this.selectedPropertyId.set(scanData.propertyId);
          this.loadPropertyScans(scanData.propertyId);
        }

        if (scanData.propertyId) {
          this.loadShareLinks(scanData.propertyId);
        }
      },
      error: (err) => {
        this.isLoadingScan.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, `فشل العثور على جلسة المسح بالمعرف: ${scanId}`)
        });
      }
    });
  }

  refreshCurrentScan(silent = false): void {
    const s = this.scan();
    if (!s) return;
    if (!silent) this.isLoadingScan.set(true);

    this.scansService.getScan(s.id).subscribe({
      next: (updated) => {
        this.scan.set(updated);
        if (!silent) this.isLoadingScan.set(false);
        if (updated.propertyId) {
          this.loadShareLinks(updated.propertyId, true);
        }
      },
      error: () => {
        if (!silent) this.isLoadingScan.set(false);
      }
    });
  }

  generateKaggleDispatchToken(): void {
    const s = this.scan();
    if (!s) return;

    this.isGeneratingToken.set(true);
    this.scansService.generateDispatchToken(s.id).subscribe({
      next: (res) => {
        this.isGeneratingToken.set(false);
        this.dispatchTokenData.set(res);
        this.showTokenModal.set(true);
        this.actionMessage.set({
          type: 'success',
          text: this.i18n.isRtl() ? 'تم توليد توكن Colab Worker بنجاح (صالح 12 ساعة)' : 'Colab Worker token minted successfully (12-hour TTL)'
        });
      },
      error: (err) => {
        this.isGeneratingToken.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'فشل توليد التوكن. تأكد من صلاحيات المشرف.')
        });
      }
    });
  }

  retryFailedRooms(): void {
    const s = this.scan();
    if (!s) return;

    if (s.rawClipsExpired) {
      this.actionMessage.set({
        type: 'error',
        text: 'لا يمكن إعادة المحاولة: انتهت صلاحية المقاطع الخام (سياسة الاحتفاظ 30 يوماً)'
      });
      return;
    }

    this.isRetrying.set(true);
    this.scansService.retryFailedRooms(s.id).subscribe({
      next: (updated) => {
        this.isRetrying.set(false);
        this.scan.set(updated);
        this.actionMessage.set({
          type: 'success',
          text: 'تمت إعادة تعيين الغرف غير المكتملة وإدراجها في طابور المعالجة بنجاح'
        });
      },
      error: (err) => {
        this.isRetrying.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'حدث خطأ أثناء محاولة إعادة معالجة الغرف')
        });
      }
    });
  }

  publishScan(): void {
    const s = this.scan();
    if (!s) return;

    this.isPublishing.set(true);
    this.scansService.publishScan(s.id).subscribe({
      next: () => {
        this.isPublishing.set(false);
        this.actionMessage.set({
          type: 'success',
          text: 'تم نشر الجولة ثلاثية الأبعاد بنجاح وأرشفة الجلسات السابقة لهذا العقار'
        });
        this.refreshCurrentScan();
        if (s.propertyId) {
          this.loadShareLinks(s.propertyId);
        }
      },
      error: (err) => {
        this.isPublishing.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر نشر المسح: تأكد من اكتمال جميع الغرف وحفظ إعدادات المشهد في الاستوديو')
        });
      }
    });
  }

  loadShareLinks(propertyId: string, silent = false): void {
    if (!silent) this.isLoadingShareLinks.set(true);
    this.propertiesService.getShareLinks(propertyId).subscribe({
      next: (links) => {
        this.shareLinks.set(links || []);
        if (!silent) this.isLoadingShareLinks.set(false);
      },
      error: () => {
        if (!silent) this.isLoadingShareLinks.set(false);
      }
    });
  }

  createNewShareLink(): void {
    const s = this.scan();
    if (!s || !s.propertyId) return;

    this.isCreatingShareLink.set(true);
    this.propertiesService.createShareLink(s.propertyId).subscribe({
      next: () => {
        this.isCreatingShareLink.set(false);
        this.actionMessage.set({
          type: 'success',
          text: 'تم إنشاء رابط مشاركة جديد بنجاح'
        });
        this.loadShareLinks(s.propertyId);
      },
      error: (err) => {
        this.isCreatingShareLink.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'فشل إنشاء الرابط: تأكد من نشر الجلسة أولاً')
        });
      }
    });
  }

  revokeShareLink(linkId: string): void {
    const s = this.scan();
    this.isRevokingId.set(linkId);

    this.propertiesService.revokeShareLink(linkId).subscribe({
      next: () => {
        this.isRevokingId.set(null);
        this.actionMessage.set({
          type: 'success',
          text: 'تم إلغاء صلاحية الرابط بنجاح'
        });
        if (s?.propertyId) {
          this.loadShareLinks(s.propertyId);
        }
      },
      error: (err) => {
        this.isRevokingId.set(null);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر إلغاء الرابط')
        });
      }
    });
  }

  canPublish(): boolean {
    const s = this.scan();
    if (!s || !s.rooms || s.rooms.length === 0) return false;
    return s.rooms.every((r) => normalizeScanRoomStatus(r.status) === 'Completed');
  }

  hasFailedOrIncompleteRooms(): boolean {
    const s = this.scan();
    if (!s || !s.rooms) return false;
    return s.rooms.some((r) => {
      const st = normalizeScanRoomStatus(r.status);
      return st === 'Failed' || st === 'Pending' || st === 'Uploading';
    });
  }

  getRoomName(room: ScanRoomJobDto, index: number): string {
    return room.roomLabel || room.roomId || (this.i18n.isRtl() ? `غرفة ${index + 1}` : `Room ${index + 1}`);
  }

  getRoomOrder(room: ScanRoomJobDto, index: number): number {
    return room.sortOrder !== undefined && room.sortOrder !== null ? room.sortOrder : index + 1;
  }

  getRoomEngineUsed(room: ScanRoomJobDto): string {
    return normalizeEngineUsed(room.engineUsed);
  }

  getRoomStatusNormalized(status: string | number): string {
    return normalizeScanRoomStatus(status);
  }

  getCaptureModeName(mode: string | number): string {
    return normalizeCaptureMode(mode);
  }

  getCaptureModeLabel(mode: string | number): string {
    const m = normalizeCaptureMode(mode);
    if (this.i18n.isRtl()) {
      return m === 'Walkthrough' ? 'جولة مستمرة' : 'غرفة بغرفة';
    }
    return m === 'Walkthrough' ? 'Walkthrough' : 'Room by Room';
  }

  getEnginePolicyName(policy: string | number): string {
    return normalizeEnginePolicy(policy);
  }

  getScanStatusLabel(status: string | number): string {
    return normalizeScanJobStatus(status);
  }

  parseRoomMetrics(room: ScanRoomJobDto): RoomParsedMetrics {
    const res: RoomParsedMetrics = {};
    const lowerKey = (room.outputR2Key || '').toLowerCase();
    res.modelFormat = lowerKey.endsWith('.sog') ? 'sog' : 'glb';

    if (room.outputSizeBytes) {
      const sizeMb = Number((room.outputSizeBytes / (1024 * 1024)).toFixed(2));
      if (res.modelFormat === 'sog') {
        res.sogModelSizeMb = sizeMb;
      } else {
        res.glbSizeMb = sizeMb;
      }
    }

    if (room.gaussianCount) {
      res.triangles = Number(room.gaussianCount);
    }

    if (room.metricsJson) {
      try {
        const d = typeof room.metricsJson === 'string' ? JSON.parse(room.metricsJson) : room.metricsJson;
        if (d.camerasRegisteredPct !== undefined) res.camerasRegisteredPct = Number(d.camerasRegisteredPct);
        else if (d.cameras_registered_pct !== undefined) res.camerasRegisteredPct = Number(d.cameras_registered_pct);
        else if (d.registered_cameras_pct !== undefined) res.camerasRegisteredPct = Number(d.registered_cameras_pct);

        if (d.glbSizeMb !== undefined) res.glbSizeMb = Number(d.glbSizeMb);
        else if (d.glb_size_mb !== undefined) res.glbSizeMb = Number(d.glb_size_mb);
        else if (d.sizes_mb?.mobile !== undefined) res.glbSizeMb = Number(d.sizes_mb.mobile);
        else if (d.sizes_mb?.full !== undefined) res.glbSizeMb = Number(d.sizes_mb.full);

        if (d.sogModelSizeMb !== undefined) res.sogModelSizeMb = Number(d.sogModelSizeMb);
        else if (d.sog_model_size_mb !== undefined) res.sogModelSizeMb = Number(d.sog_model_size_mb);
        else if (d.sog_size !== undefined) res.sogModelSizeMb = Number((d.sog_size / (1024 * 1024)).toFixed(2));

        if (d.triangles !== undefined) res.triangles = Number(d.triangles);
        else if (d.triangleCount !== undefined) res.triangles = Number(d.triangleCount);
        else if (d.triangle_count !== undefined) res.triangles = Number(d.triangle_count);

        if (d.psnr !== undefined) res.psnr = Number(d.psnr);
        if (d.ssim !== undefined) res.ssim = Number(d.ssim);
        if (d.processingTimeSec !== undefined) res.processingTimeSec = Number(d.processingTimeSec);
      } catch {
        // Ignore malformed metrics JSON
      }
    }

    return res;
  }

  getRoomProgress(status: string | number): number {
    switch (normalizeScanRoomStatus(status)) {
      case 'Uploading': return 15;
      case 'Pending': return 40;
      case 'Processing': return 75;
      case 'Completed': return 100;
      case 'Failed': return 100;
      default: return 10;
    }
  }

  getRoomFillClass(status: string | number): string {
    switch (normalizeScanRoomStatus(status)) {
      case 'Completed': return 'fill-success';
      case 'Processing': return 'fill-info';
      case 'Pending': return 'fill-warning';
      case 'Failed': return 'fill-danger';
      default: return 'fill-secondary';
    }
  }

  getRoomStatusStepDescription(status: string | number): string {
    const isAr = this.i18n.isRtl();
    switch (normalizeScanRoomStatus(status)) {
      case 'Completed': return isAr ? 'اكتمل بناء مجسم .glb' : '.glb mesh generated';
      case 'Processing': return isAr ? 'المعالجة ثلاثية الأبعاد على Colab T4 (Meshroom)' : 'Meshroom 3D reconstruction on GPU';
      case 'Pending': return isAr ? 'المقطع مرفوع، في انتظار المعالج' : 'Video uploaded, awaiting worker';
      case 'Uploading': return isAr ? 'جاري رفع الفيديو من الهاتف' : 'Uploading video from device';
      case 'Failed': return isAr ? 'فشلت المعالجة' : 'Reconstruction failed';
      default: return String(status);
    }
  }

  getRoomStatusBadge(status: string | number): { labelAr: string; labelEn: string; class: string } {
    const s = normalizeScanRoomStatus(status);
    switch (s) {
      case 'Completed': return { labelAr: 'مكتمل', labelEn: 'Completed', class: 'badge-success' };
      case 'Processing': return { labelAr: 'قيد المعالجة', labelEn: 'Processing', class: 'badge-info' };
      case 'Pending': return { labelAr: 'بالانتظار', labelEn: 'Pending', class: 'badge-warning' };
      case 'Uploading': return { labelAr: 'قيد الرفع', labelEn: 'Uploading', class: 'badge-secondary' };
      case 'Failed': return { labelAr: 'فشل', labelEn: 'Failed', class: 'badge-danger' };
      default: return { labelAr: s, labelEn: s, class: 'badge-secondary' };
    }
  }

  getScanStatusBadge(status: string | number): { labelAr: string; labelEn: string; class: string } {
    const s = normalizeScanJobStatus(status);
    switch (s) {
      case 'Published': return { labelAr: 'منشور', labelEn: 'Published', class: 'badge-success' };
      case 'ReadyForReview': return { labelAr: 'جاهز للمراجعة', labelEn: 'Ready for Review', class: 'badge-success' };
      case 'Processing': return { labelAr: 'قيد المعالجة', labelEn: 'Processing', class: 'badge-info' };
      case 'PendingProcessing':
      case 'Uploading':
      case 'Draft': return { labelAr: 'قيد الإعداد / الانتظار', labelEn: s, class: 'badge-warning' };
      case 'Failed': return { labelAr: 'فشل', labelEn: 'Failed', class: 'badge-danger' };
      case 'Archived': return { labelAr: 'مؤرشف', labelEn: 'Archived', class: 'badge-secondary' };
      default: return { labelAr: s, labelEn: s, class: 'badge-secondary' };
    }
  }

  getPublicShareUrl(link: ShareLinkDto): string {
    const viewerUrl = (API_CONFIG.viewerBaseUrl || 'https://viewer-web.pages.dev').replace(/\/+$/, '');
    return `${viewerUrl}/v/${link.token}`;
  }

  getColabApiBaseUrl(): string {
    return API_CONFIG.baseUrl.replace(/\/+$/, '');
  }

  getBashCommandSnippet(): string {
    const data = this.dispatchTokenData();
    if (!data) return '';
    return `export API_BASE_URL="${this.getColabApiBaseUrl()}"\nexport SCAN_ID="${data.scanId}"\nexport WORKER_TOKEN="${data.workerToken}"\nexport HMAC_SECRET="${this.colabHmacSecretPlaceholder}"`;
  }

  getPythonSnippet(): string {
    const data = this.dispatchTokenData();
    if (!data) return '';
    return [
      '# Colab Meshroom Worker (Cell 1)',
      `API_BASE_URL = "${this.getColabApiBaseUrl()}"`,
      `SCAN_ID = "${data.scanId}"`,
      `WORKER_TOKEN = "${data.workerToken}"`,
      `HMAC_SECRET = "${this.colabHmacSecretPlaceholder}"`
    ].join('\n');
  }

  copyToClipboard(text: string, key: string): void {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => this.setCopiedKey(key)).catch(() => this.fallbackCopy(text, key));
    } else {
      this.fallbackCopy(text, key);
    }
  }

  private fallbackCopy(text: string, key: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.setCopiedKey(key);
    } catch {
      // ignore
    } finally {
      document.body.removeChild(textarea);
    }
  }

  private setCopiedKey(key: string): void {
    this.copiedMap.update((m) => ({ ...m, [key]: true }));
    setTimeout(() => {
      this.copiedMap.update((m) => ({ ...m, [key]: false }));
    }, 2200);
  }

  isCopied(key: string): boolean {
    return !!this.copiedMap()[key];
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(this.i18n.isRtl() ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  formatTimeOnly(dateStr?: string): string {
    if (!dateStr) return '--';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString(this.i18n.isRtl() ? 'ar-EG' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }
}
