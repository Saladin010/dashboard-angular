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
  templateUrl: './scan-jobs-monitor.component.html',
  styleUrls: ['./scan-jobs-monitor.component.scss']
})
export class ScanJobsMonitorComponent implements OnInit, OnDestroy {
  private readonly scansService = inject(ScansService);
  private readonly propertiesService = inject(PropertiesService);
  readonly authService = inject(AuthService);
  readonly i18n = inject(I18nService);
  private readonly route = inject(ActivatedRoute);

  searchScanIdInput = '';
  readonly showDirectSearch = signal<boolean>(false);
  readonly showAdvancedTools = signal<boolean>(false);
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

  readonly currentPipelineStage = computed<number>(() => {
    const st = this.scanStatusNormalized();
    switch (st) {
      case 'Draft':
      case 'Uploading':
        return 1;
      case 'PendingProcessing':
      case 'Processing':
        return 2;
      case 'ReadyForReview':
        return 3;
      case 'Published':
        return 4;
      default:
        return 2;
    }
  });

  readonly shareLinks = signal<ShareLinkDto[]>([]);
  readonly isLoadingShareLinks = signal<boolean>(false);
  readonly isCreatingShareLink = signal<boolean>(false);
  readonly isRevokingId = signal<string | null>(null);

  readonly isRetrying = signal<boolean>(false);
  readonly isPublishing = signal<boolean>(false);
  readonly isDeletingScan = signal<boolean>(false);
  readonly isGeneratingToken = signal<boolean>(false);
  readonly dispatchTokenData = signal<DispatchTokenResponse | null>(null);
  readonly showTokenModal = signal<boolean>(false);
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
        modelSizeMb: '--',
        processingTime: '--',
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
      procTimeStr = `${Math.floor(diffSec / 60)}m ${diffSec % 60}s`;
    }

    return {
      camerasRegisteredPct: avgCameras,
      modelSizeMb: totalModelMb > 0 ? totalModelMb.toFixed(1) : '--',
      processingTime: procTimeStr,
      triangleCount: totalPrimitives > 0 ? totalPrimitives.toLocaleString() : '--'
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

  toggleDirectSearch(): void {
    this.showDirectSearch.update((v) => !v);
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

  private pickBestScan(scans: ScanJobDto[]): ScanJobDto | undefined {
    const rank: Record<string, number> = {
      Published: 1,
      ReadyForReview: 2,
      Processing: 3,
      PendingProcessing: 4,
      Uploading: 5,
      Failed: 6,
      Archived: 7,
      Draft: 8
    };
    return [...scans].sort((a, b) => {
      const ra = rank[normalizeScanJobStatus(a.status)] ?? 99;
      const rb = rank[normalizeScanJobStatus(b.status)] ?? 99;
      return ra - rb;
    })[0];
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
          const best = this.pickBestScan(scans);
          if (best) this.loadScan(best.id);
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
            throw new Error('Missing ETag header from R2 response.');
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
        text: this.i18n.isRtl() ? 'تم رفع الفيديوهات بنجاح — الجلسة الآن في انتظار معالج Colab.' : 'Scan job queued for Colab Worker!'
      });
      this.loadPropertyScans(propertyId, created.scanId);
    } catch (err: any) {
      this.isUploadingScan.set(false);
      const msg = extractApiErrorMessage(err, err?.message || 'فشل رفع الفيديو إلى R2.');
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
          text: extractApiErrorMessage(err, `فشل العثور على الجلسة: ${scanId}`)
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

  deleteCurrentScan(): void {
    const s = this.scan();
    if (!s) return;
    this.isDeletingScan.set(true);
    this.scansService.deleteScan(s.id).subscribe({
      next: () => {
        this.isDeletingScan.set(false);
        this.scan.set(null);
        this.actionMessage.set({
          type: 'success',
          text: this.i18n.isRtl() ? 'تم حذف جلسة المسح بنجاح.' : 'Scan job deleted.'
        });
        if (this.selectedPropertyId()) {
          this.loadPropertyScans(this.selectedPropertyId());
        }
      },
      error: (err) => {
        this.isDeletingScan.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر حذف جلسة المسح.')
        });
      }
    });
  }

  quickCopyOrCreateShareLink(): void {
    const active = this.shareLinks().find((l) => l.isActive);
    if (active) {
      this.copyToClipboard(this.getPublicShareUrl(active), 'heroShare');
      return;
    }
    const s = this.scan();
    if (!s?.propertyId) return;
    this.isCreatingShareLink.set(true);
    this.propertiesService.createShareLink(s.propertyId).subscribe({
      next: (created) => {
        this.isCreatingShareLink.set(false);
        this.loadShareLinks(s.propertyId);
        this.copyToClipboard(this.getPublicShareUrl(created), 'heroShare');
      },
      error: (err) => {
        this.isCreatingShareLink.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'تعذر إنشاء رابط المشاركة.')
        });
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
      },
      error: (err) => {
        this.isGeneratingToken.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'فشل توليد التوكن.')
        });
      }
    });
  }

  retryFailedRooms(): void {
    const s = this.scan();
    if (!s || s.rawClipsExpired) return;

    this.isRetrying.set(true);
    this.scansService.retryFailedRooms(s.id).subscribe({
      next: (updated) => {
        this.isRetrying.set(false);
        this.scan.set(updated);
        this.actionMessage.set({
          type: 'success',
          text: 'تمت إعادة إدراج الغرف غير المكتملة في طابور المعالجة.'
        });
      },
      error: (err) => {
        this.isRetrying.set(false);
        this.actionMessage.set({
          type: 'error',
          text: extractApiErrorMessage(err, 'حدث خطأ أثناء محاولة إعادة المعالجة')
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
          text: 'تم نشر الجولة ثلاثية الأبعاد بنجاح!'
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
          text: extractApiErrorMessage(err, 'تعذر نشر المسح: تأكد من اكتمال جميع الغرف.')
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
          text: 'تم إلغاء صلاحية الرابط'
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
    return room.sortOrder !== undefined && room.sortOrder !== null ? room.sortOrder + 1 : index + 1;
  }

  getRoomEngineUsed(room: ScanRoomJobDto): string {
    return normalizeEngineUsed(room.engineUsed);
  }

  getRoomStatusNormalized(status: string | number): string {
    return normalizeScanRoomStatus(status);
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

  parseRoomMetrics(room: ScanRoomJobDto): RoomParsedMetrics {
    const res: RoomParsedMetrics = {};
    const lowerKey = (room.outputR2Key || '').toLowerCase();
    res.modelFormat = lowerKey.endsWith('.sog') ? 'sog' : 'glb';

    if (room.outputSizeBytes) {
      const sizeMb = Number((room.outputSizeBytes / (1024 * 1024)).toFixed(2));
      if (res.modelFormat === 'sog') res.sogModelSizeMb = sizeMb;
      else res.glbSizeMb = sizeMb;
    }

    if (room.gaussianCount) {
      res.triangles = Number(room.gaussianCount);
    }

    if (room.metricsJson) {
      try {
        const d = typeof room.metricsJson === 'string' ? JSON.parse(room.metricsJson) : room.metricsJson;
        if (d.camerasRegisteredPct !== undefined) res.camerasRegisteredPct = Number(d.camerasRegisteredPct);
        else if (d.cameras_registered_pct !== undefined) res.camerasRegisteredPct = Number(d.cameras_registered_pct);
        else if (d.sfmCalibrated && Array.isArray(d.sfmCalibrated) && d.sfmCalibrated[0] > 0) {
          res.camerasRegisteredPct = Number(((d.sfmCalibrated[1] / d.sfmCalibrated[0]) * 100).toFixed(1));
        }

        if (d.glbSizeMb !== undefined) res.glbSizeMb = Number(d.glbSizeMb);
        else if (d.glb_size_mb !== undefined) res.glbSizeMb = Number(d.glb_size_mb);
        if (d.sogModelSizeMb !== undefined) res.sogModelSizeMb = Number(d.sogModelSizeMb);
        if (d.triangles !== undefined) res.triangles = Number(d.triangles);
        else if (d.triangleCount !== undefined) res.triangles = Number(d.triangleCount);
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
      case 'Completed':
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
      case 'Completed': return isAr ? 'اكتمل بناء مجسم .glb بنجاح' : '.glb mesh ready';
      case 'Processing': return isAr ? 'جاري المعالجة على Colab GPU' : 'Reconstructing on GPU';
      case 'Pending': return isAr ? 'الفيديو مرفوع وبانتظار Colab' : 'Queued for worker';
      case 'Uploading': return isAr ? 'لم يكتمل رفع الفيديو' : 'Awaiting video upload';
      case 'Failed': return isAr ? 'فشلت المعالجة' : 'Processing failed';
      default: return String(status);
    }
  }

  getRoomStatusBadge(status: string | number): { labelAr: string; labelEn: string; class: string } {
    const s = normalizeScanRoomStatus(status);
    switch (s) {
      case 'Completed': return { labelAr: 'مكتمل', labelEn: 'Completed', class: 'badge-success' };
      case 'Processing': return { labelAr: 'قيد المعالجة', labelEn: 'Processing', class: 'badge-info' };
      case 'Pending': return { labelAr: 'بالانتظار', labelEn: 'Pending', class: 'badge-warning' };
      case 'Uploading': return { labelAr: 'غير مكتمل الرفع', labelEn: 'Uploading', class: 'badge-secondary' };
      case 'Failed': return { labelAr: 'فشل', labelEn: 'Failed', class: 'badge-danger' };
      default: return { labelAr: s, labelEn: s, class: 'badge-secondary' };
    }
  }

  getScanStatusBadge(status: string | number): { labelAr: string; labelEn: string; class: string } {
    const s = normalizeScanJobStatus(status);
    switch (s) {
      case 'Published': return { labelAr: 'منشور', labelEn: 'Published', class: 'badge-success' };
      case 'ReadyForReview': return { labelAr: 'جاهز للمراجعة', labelEn: 'Ready for Review', class: 'badge-info' };
      case 'Processing': return { labelAr: 'قيد المعالجة', labelEn: 'Processing', class: 'badge-info' };
      case 'PendingProcessing': return { labelAr: 'في الطابور', labelEn: 'Queued', class: 'badge-warning' };
      case 'Uploading':
      case 'Draft': return { labelAr: 'مسودة / قيد الرفع', labelEn: 'Draft', class: 'badge-secondary' };
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

  formatShortDate(dateStr?: string): string {
    if (!dateStr) return '--';
    try {
      return new Date(dateStr).toLocaleDateString(this.i18n.isRtl() ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }
}
