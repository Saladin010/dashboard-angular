import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  ViewChild,
  ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { ScansService } from '../../core/services/scans.service';
import { API_CONFIG } from '../../core/config/api.config';
import {
  ScanPreviewDto,
  SceneConfigurationDto,
  SceneRoomConfigDto,
  SceneHotspotDto
} from '../../core/models/scan.model';

@Component({
  selector: 'app-studio-wrapper',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './studio-wrapper.component.html',
  styleUrls: ['./studio-wrapper.component.scss']
})
export class StudioWrapperComponent implements OnInit, OnDestroy {
  private readonly scansService = inject(ScansService);
  private readonly route = inject(ActivatedRoute);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('editorFrame') editorFrame?: ElementRef<HTMLIFrameElement>;

  // Route / state signals
  readonly scanId = signal<string>('');
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly scanPreview = signal<ScanPreviewDto | null>(null);
  readonly editorReady = signal<boolean>(false);

  // Active room & Scene configuration
  readonly activeRoomId = signal<string>('');
  readonly sceneConfig = signal<SceneConfigurationDto>({
    version: 1,
    rooms: {},
    hotspots: []
  });
  readonly expectedVersion = signal<number>(1);

  // 6-DOF Crop Box sliders (min/max X, Y, Z)
  readonly cropMinX = signal<number>(-5);
  readonly cropMaxX = signal<number>(5);
  readonly cropMinY = signal<number>(-2);
  readonly cropMaxY = signal<number>(4);
  readonly cropMinZ = signal<number>(-5);
  readonly cropMaxZ = signal<number>(5);

  // Floor tilt & Spawn Pose
  readonly floorTilt = signal<number>(0);
  readonly spawnPose = signal<number[] | null>(null);
  readonly spawnSavedToast = signal<boolean>(false);

  // Hotspot placement
  readonly isPlacingHotspot = signal<boolean>(false);
  readonly hotspotTargetRoomId = signal<string>('');
  readonly hotspotTitle = signal<string>('');

  // Save & Optimistic Concurrency states
  readonly saving = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);
  readonly conflictError = signal<string | null>(null);

  private routeSub?: Subscription;

  // Editor safe URL
  readonly editorSafeUrl = computed<SafeResourceUrl>(() => {
    const base = API_CONFIG.studioBaseUrl || API_CONFIG.viewerBaseUrl || 'https://studio-editor-dmx.pages.dev';
    return this.sanitizer.bypassSecurityTrustResourceUrl(base);
  });

  // Current room hotspots
  readonly currentRoomHotspots = computed<SceneHotspotDto[]>(() => {
    const currentId = this.activeRoomId();
    return this.sceneConfig().hotspots.filter(h => h.sourceRoomId === currentId);
  });

  // Other available rooms for transition hotspot destination
  readonly otherRooms = computed(() => {
    const currentId = this.activeRoomId();
    return (this.scanPreview()?.rooms || []).filter(r => r.roomId !== currentId);
  });

  ngOnInit(): void {
    window.addEventListener('message', this.handleWindowMessage);

    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = params.get('scanId') || this.route.snapshot.queryParamMap.get('scanId') || '';
      if (id) {
        this.scanId.set(id);
        this.loadScanPreview();
      } else {
        // If loaded directly without scanId, try query params or mock fallback
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.handleWindowMessage);
    this.routeSub?.unsubscribe();
  }

  onIframeLoaded(): void {
    this.sendToEditor('studio:ping');
    if (this.scanPreview() && this.activeRoomId()) {
      this.syncActiveRoomToEditor();
    }
  }

  loadScanPreview(): void {
    const id = this.scanId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);
    this.conflictError.set(null);

    this.scansService.getScanPreview(id).subscribe({
      next: (preview) => {
        this.loading.set(false);
        this.scanPreview.set(preview);
        const version = preview.sceneConfig?.version ?? 1;
        this.expectedVersion.set(version);
        this.sceneConfig.set(preview.sceneConfig || {
          version,
          rooms: {},
          hotspots: []
        });

        // Determine initial active room
        if (preview.rooms && preview.rooms.length > 0) {
          const initialRoom = preview.sceneConfig?.defaultRoomId || preview.rooms[0].roomId;
          this.activeRoomId.set(initialRoom);
          this.applyRoomConfigToSliders(initialRoom);
          this.syncActiveRoomToEditor();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'فشل تحميل بيانات معاينة المسح ثلاثي الأبعاد.');
      }
    });
  }

  selectRoom(roomId: string): void {
    if (this.activeRoomId() === roomId) return;

    // Persist current sliders to active room config before switching
    this.persistCurrentRoomToConfig();

    this.activeRoomId.set(roomId);
    this.applyRoomConfigToSliders(roomId);
    this.syncActiveRoomToEditor();
  }

  private applyRoomConfigToSliders(roomId: string): void {
    const config = this.sceneConfig().rooms[roomId];
    if (config) {
      if (config.cropBounds && config.cropBounds.length === 6) {
        this.cropMinX.set(config.cropBounds[0]);
        this.cropMaxX.set(config.cropBounds[1]);
        this.cropMinY.set(config.cropBounds[2]);
        this.cropMaxY.set(config.cropBounds[3]);
        this.cropMinZ.set(config.cropBounds[4]);
        this.cropMaxZ.set(config.cropBounds[5]);
      }
      if (typeof config.floorTiltDegrees === 'number') {
        this.floorTilt.set(config.floorTiltDegrees);
      }
      this.spawnPose.set(config.defaultSpawnPose || null);
    } else {
      // Default initial slider values
      this.cropMinX.set(-5);
      this.cropMaxX.set(5);
      this.cropMinY.set(-2);
      this.cropMaxY.set(4);
      this.cropMinZ.set(-5);
      this.cropMaxZ.set(5);
      this.floorTilt.set(0);
      this.spawnPose.set(null);
    }

    // Set default target room for hotspots
    const others = this.otherRooms();
    if (others.length > 0) {
      this.hotspotTargetRoomId.set(others[0].roomId);
    }
  }

  private persistCurrentRoomToConfig(): void {
    const roomId = this.activeRoomId();
    if (!roomId) return;

    const currentRooms = { ...this.sceneConfig().rooms };
    const room = this.scanPreview()?.rooms.find(r => r.roomId === roomId);
    const roomName = room?.roomName || currentRooms[roomId]?.roomName || 'الغرفة';

    const updatedRoomConfig: SceneRoomConfigDto = {
      roomName,
      cropBounds: [
        this.cropMinX(),
        this.cropMaxX(),
        this.cropMinY(),
        this.cropMaxY(),
        this.cropMinZ(),
        this.cropMaxZ()
      ],
      floorTiltDegrees: this.floorTilt(),
      defaultSpawnPose: this.spawnPose() || undefined
    };

    currentRooms[roomId] = updatedRoomConfig;

    this.sceneConfig.set({
      ...this.sceneConfig(),
      rooms: currentRooms
    });
  }

  private syncActiveRoomToEditor(): void {
    const roomId = this.activeRoomId();
    const preview = this.scanPreview();
    if (!roomId || !preview) return;

    const room = preview.rooms.find(r => r.roomId === roomId);
    if (room && room.signedModelUrl) {
      this.sendToEditor('studio:loadSog', { signedModelUrl: room.signedModelUrl });
    }

    // Send crop box bounds
    const bounds: [number, number, number, number, number, number] = [
      this.cropMinX(),
      this.cropMaxX(),
      this.cropMinY(),
      this.cropMaxY(),
      this.cropMinZ(),
      this.cropMaxZ()
    ];
    this.sendToEditor('studio:setCropBox', { bounds });

    // Send floor tilt
    this.sendToEditor('studio:setFloorTilt', { degrees: this.floorTilt() });
  }

  onCropBoxChange(): void {
    const bounds: [number, number, number, number, number, number] = [
      this.cropMinX(),
      this.cropMaxX(),
      this.cropMinY(),
      this.cropMaxY(),
      this.cropMinZ(),
      this.cropMaxZ()
    ];
    this.sendToEditor('studio:setCropBox', { bounds });
    this.persistCurrentRoomToConfig();
  }

  onFloorTiltChange(): void {
    this.sendToEditor('studio:setFloorTilt', { degrees: this.floorTilt() });
    this.persistCurrentRoomToConfig();
  }

  captureEyeLevelSpawn(): void {
    this.sendToEditor('studio:captureSpawnPose');
  }

  calibrateDoorScale(): void {
    this.sendToEditor('studio:calibrateDoorScale', { doorHeightMeters: 2.1 });
  }

  startHotspotPlacement(): void {
    const others = this.otherRooms();
    if (others.length === 0) return;

    if (!this.hotspotTargetRoomId()) {
      this.hotspotTargetRoomId.set(others[0].roomId);
    }
    this.isPlacingHotspot.set(true);
    this.sendToEditor('studio:enableSplatPick');
  }

  cancelHotspotPlacement(): void {
    this.isPlacingHotspot.set(false);
    this.sendToEditor('studio:disableSplatPick');
  }

  private addHotspotAtCoords(coords: [number, number, number]): void {
    const targetId = this.hotspotTargetRoomId();
    const targetRoom = this.scanPreview()?.rooms.find(r => r.roomId === targetId);
    const targetName = targetRoom?.roomName || 'الغرفة الهدف';
    const title = this.hotspotTitle() || `الانتقال إلى ${targetName}`;

    const newHotspot: SceneHotspotDto = {
      id: 'hs_' + Math.random().toString(36).substring(2, 9),
      sourceRoomId: this.activeRoomId(),
      targetRoomId: targetId,
      title,
      position: coords
    };

    const currentConfig = this.sceneConfig();
    this.sceneConfig.set({
      ...currentConfig,
      hotspots: [...currentConfig.hotspots, newHotspot]
    });

    this.isPlacingHotspot.set(false);
    this.hotspotTitle.set('');
  }

  removeHotspot(hotspotId: string): void {
    const currentConfig = this.sceneConfig();
    this.sceneConfig.set({
      ...currentConfig,
      hotspots: currentConfig.hotspots.filter(h => h.id !== hotspotId)
    });
  }

  saveSceneConfig(): void {
    const id = this.scanId();
    if (!id) return;

    this.persistCurrentRoomToConfig();
    this.saving.set(true);
    this.saveSuccess.set(false);
    this.conflictError.set(null);
    this.error.set(null);

    this.scansService.updateSceneConfig(id, {
      expectedVersion: this.expectedVersion(),
      config: this.sceneConfig()
    }).subscribe({
      next: (updatedConfig) => {
        this.saving.set(false);
        this.saveSuccess.set(true);
        this.expectedVersion.set(updatedConfig.version);
        this.sceneConfig.set(updatedConfig);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        if (err.status === 409) {
          this.conflictError.set('تم تعديل هذا المشهد بواسطة مستخدم آخر. الإصدار المتوقع لم يعد متطابقاً مع قاعدة البيانات.');
        } else {
          this.error.set(err?.error?.message || 'فشل حفظ إعدادات المشهد.');
          setTimeout(() => this.error.set(null), 4000);
        }
      }
    });
  }

  reloadLatestVersion(): void {
    this.conflictError.set(null);
    this.loadScanPreview();
  }

  private sendToEditor(type: string, payload?: any): void {
    const iframe = this.editorFrame?.nativeElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type, payload }, '*');
    }
  }

  private handleWindowMessage = (event: MessageEvent): void => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'studio:ready':
        this.editorReady.set(true);
        this.syncActiveRoomToEditor();
        break;

      case 'studio:splatPicked':
        if (data.coords && this.isPlacingHotspot()) {
          this.addHotspotAtCoords(data.coords);
        }
        break;

      case 'studio:spawnPoseCaptured':
        if (data.pose) {
          const pose = data.pose.pose || data.pose.position;
          this.spawnPose.set(pose);
          this.persistCurrentRoomToConfig();
          this.spawnSavedToast.set(true);
          setTimeout(() => this.spawnSavedToast.set(false), 2500);
        }
        break;

      case 'studio:cropBoxChanged':
        if (data.bounds && Array.isArray(data.bounds) && data.bounds.length === 6) {
          this.cropMinX.set(data.bounds[0]);
          this.cropMaxX.set(data.bounds[1]);
          this.cropMinY.set(data.bounds[2]);
          this.cropMaxY.set(data.bounds[3]);
          this.cropMinZ.set(data.bounds[4]);
          this.cropMaxZ.set(data.bounds[5]);
          this.persistCurrentRoomToConfig();
        }
        break;

      case 'studio:floorTiltChanged':
        if (typeof data.degrees === 'number') {
          this.floorTilt.set(data.degrees);
          this.persistCurrentRoomToConfig();
        }
        break;
    }
  };
}
