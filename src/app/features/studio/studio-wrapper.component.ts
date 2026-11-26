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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';

import { ScansService } from '../../core/services/scans.service';
import { PropertiesService } from '../../core/services/properties.service';
import { API_CONFIG } from '../../core/config/api.config';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';
import {
  ScanPreviewDto,
  SceneConfigurationDto,
  SceneItemDto,
  SceneItemHotspotsPayload,
  SceneHotspotDto
} from '../../core/models/scan.model';

interface RoomStudioState {
  roomLabel: string;
  sortOrder: number;
  cropBounds: [number, number, number, number, number, number];
  floorTiltDegrees: number;
  cameraPosition?: number[];
  cameraTarget?: number[];
  links: SceneHotspotDto[];
}

@Component({
  selector: 'app-studio-wrapper',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './studio-wrapper.component.html',
  styleUrls: ['./studio-wrapper.component.scss']
})
export class StudioWrapperComponent implements OnInit, OnDestroy {
  private readonly scansService = inject(ScansService);
  private readonly propertiesService = inject(PropertiesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  @ViewChild('editorFrame') editorFrame?: ElementRef<HTMLIFrameElement>;

  readonly scanId = signal<string>('');
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly scanPreview = signal<ScanPreviewDto | null>(null);
  readonly editorReady = signal<boolean>(false);

  // Quick scan picker when /studio opened without :scanId
  readonly availableScans = signal<{ scanId: string; propertyTitle: string }[]>([]);

  readonly activeRoomId = signal<string>('');
  readonly expectedVersion = signal<number>(0);
  readonly eyeHeightMeters = signal<number>(1.6);
  readonly defaultSceneId = signal<string>('');
  private roomStates = signal<Record<string, RoomStudioState>>({});

  // 6-DOF Crop Box sliders
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

  readonly editorSafeUrl = computed<SafeResourceUrl>(() => {
    const base = API_CONFIG.studioBaseUrl || 'https://studio-editor-dmx.pages.dev';
    return this.sanitizer.bypassSecurityTrustResourceUrl(base);
  });

  readonly currentRoomHotspots = computed<SceneHotspotDto[]>(() => {
    const currentId = this.activeRoomId();
    return this.roomStates()[currentId]?.links || [];
  });

  readonly otherRooms = computed(() => {
    const currentId = this.activeRoomId();
    return (this.scanPreview()?.rooms || []).filter((r) => r.roomId !== currentId);
  });

  ngOnInit(): void {
    window.addEventListener('message', this.handleWindowMessage);

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('scanId') || this.route.snapshot.queryParamMap.get('scanId') || '';
      if (id) {
        this.scanId.set(id);
        this.loadScanPreview();
      } else {
        this.loading.set(false);
        this.loadAvailableScans();
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.handleWindowMessage);
    this.routeSub?.unsubscribe();
  }

  private loadAvailableScans(): void {
    this.propertiesService.getProperties({ pageSize: 20 }).subscribe({
      next: (res) => {
        const list: { scanId: string; propertyTitle: string }[] = [];
        for (const prop of res.items || []) {
          this.propertiesService.getPropertyScans(prop.id).subscribe({
            next: (scans) => {
              for (const sc of scans || []) {
                const st = String(sc.status ?? '').toLowerCase();
                if (st === '6' || st === 'archived') continue;
                list.push({ scanId: sc.id, propertyTitle: prop.title });
              }
              this.availableScans.set([...list]);
            },
            error: () => {}
          });
        }
      },
      error: () => {}
    });
  }

  onSelectAvailableScan(scanId: string): void {
    if (!scanId) return;
    this.router.navigate(['/studio', scanId]);
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
        const cfg = preview.sceneConfig;
        this.expectedVersion.set(cfg?.version ?? 0);
        this.eyeHeightMeters.set(cfg?.eyeHeightMeters ?? 1.6);

        const initialDefault =
          cfg?.defaultSceneId ||
          preview.rooms?.[0]?.roomId ||
          '';
        this.defaultSceneId.set(initialDefault);

        // Hydrate roomStates from backend scenes + preview rooms
        const nextStates: Record<string, RoomStudioState> = {};
        const scenesByRoomId = new Map<string, SceneItemDto>();
        for (const s of cfg?.scenes || []) {
          scenesByRoomId.set(s.roomId, s);
        }

        for (const r of preview.rooms || []) {
          const existing = scenesByRoomId.get(r.roomId);
          const hsRaw = existing?.hotspots;
          let cropBounds: [number, number, number, number, number, number] = [-5, 5, -2, 4, -5, 5];
          let floorTiltDegrees = 0;
          let links: SceneHotspotDto[] = [];

          if (Array.isArray(hsRaw)) {
            links = hsRaw;
          } else if (hsRaw && typeof hsRaw === 'object') {
            const payload = hsRaw as SceneItemHotspotsPayload;
            if (Array.isArray(payload.cropBounds) && payload.cropBounds.length === 6) {
              cropBounds = payload.cropBounds as [number, number, number, number, number, number];
            }
            if (typeof payload.floorTiltDegrees === 'number') {
              floorTiltDegrees = payload.floorTiltDegrees;
            }
            if (Array.isArray(payload.links)) {
              links = payload.links;
            }
          }

          nextStates[r.roomId] = {
            roomLabel: existing?.roomLabel || r.roomLabel || r.roomId,
            sortOrder: existing?.sortOrder ?? r.sortOrder ?? 0,
            cropBounds,
            floorTiltDegrees,
            cameraPosition: existing?.cameraPosition ?? undefined,
            cameraTarget: existing?.cameraTarget ?? undefined,
            links
          };
        }

        this.roomStates.set(nextStates);

        if (preview.rooms && preview.rooms.length > 0) {
          const initialRoom = nextStates[initialDefault] ? initialDefault : preview.rooms[0].roomId;
          this.activeRoomId.set(initialRoom);
          this.applyRoomConfigToSliders(initialRoom);
          this.syncActiveRoomToEditor();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractApiErrorMessage(err, 'فشل تحميل بيانات معاينة المسح ثلاثي الأبعاد.'));
      }
    });
  }

  selectRoom(roomId: string): void {
    if (this.activeRoomId() === roomId) return;
    this.persistCurrentRoomToConfig();
    this.activeRoomId.set(roomId);
    this.applyRoomConfigToSliders(roomId);
    this.syncActiveRoomToEditor();
  }

  private applyRoomConfigToSliders(roomId: string): void {
    const st = this.roomStates()[roomId];
    if (st) {
      this.cropMinX.set(st.cropBounds[0]);
      this.cropMaxX.set(st.cropBounds[1]);
      this.cropMinY.set(st.cropBounds[2]);
      this.cropMaxY.set(st.cropBounds[3]);
      this.cropMinZ.set(st.cropBounds[4]);
      this.cropMaxZ.set(st.cropBounds[5]);
      this.floorTilt.set(st.floorTiltDegrees);
      if (st.cameraPosition && st.cameraTarget) {
        this.spawnPose.set([...st.cameraPosition, ...st.cameraTarget]);
      } else {
        this.spawnPose.set(null);
      }
    } else {
      this.cropMinX.set(-5);
      this.cropMaxX.set(5);
      this.cropMinY.set(-2);
      this.cropMaxY.set(4);
      this.cropMinZ.set(-5);
      this.cropMaxZ.set(5);
      this.floorTilt.set(0);
      this.spawnPose.set(null);
    }

    const others = this.otherRooms();
    if (others.length > 0) {
      this.hotspotTargetRoomId.set(others[0].roomId);
    }
  }

  private persistCurrentRoomToConfig(): void {
    const roomId = this.activeRoomId();
    if (!roomId) return;

    const current = { ...this.roomStates() };
    const existing = current[roomId];
    const room = this.scanPreview()?.rooms.find((r) => r.roomId === roomId);

    const pose = this.spawnPose();
    const cameraPosition = pose && pose.length >= 3 ? pose.slice(0, 3) : existing?.cameraPosition;
    const cameraTarget = pose && pose.length >= 6 ? pose.slice(3, 6) : existing?.cameraTarget;

    current[roomId] = {
      roomLabel: room?.roomLabel || existing?.roomLabel || roomId,
      sortOrder: room?.sortOrder ?? existing?.sortOrder ?? 0,
      cropBounds: [
        this.cropMinX(),
        this.cropMaxX(),
        this.cropMinY(),
        this.cropMaxY(),
        this.cropMinZ(),
        this.cropMaxZ()
      ],
      floorTiltDegrees: this.floorTilt(),
      cameraPosition,
      cameraTarget,
      links: existing?.links || []
    };

    this.roomStates.set(current);
  }

  private syncActiveRoomToEditor(): void {
    const roomId = this.activeRoomId();
    const preview = this.scanPreview();
    if (!roomId || !preview) return;

    const room = preview.rooms.find((r) => r.roomId === roomId);
    if (room && room.signedModelUrl) {
      this.sendToEditor('studio:loadSog', { signedModelUrl: room.signedModelUrl });
    }

    const bounds: [number, number, number, number, number, number] = [
      this.cropMinX(),
      this.cropMaxX(),
      this.cropMinY(),
      this.cropMaxY(),
      this.cropMinZ(),
      this.cropMaxZ()
    ];
    this.sendToEditor('studio:setCropBox', { bounds });
    this.sendToEditor('studio:setFloorTilt', { degrees: this.floorTilt() });
  }

  onCropBoxChange(): void {
    const minX = Math.min(Number(this.cropMinX()), Number(this.cropMaxX()) - 0.2);
    const maxX = Math.max(Number(this.cropMaxX()), minX + 0.2);
    const minY = Math.min(Number(this.cropMinY()), Number(this.cropMaxY()) - 0.2);
    const maxY = Math.max(Number(this.cropMaxY()), minY + 0.2);
    const minZ = Math.min(Number(this.cropMinZ()), Number(this.cropMaxZ()) - 0.2);
    const maxZ = Math.max(Number(this.cropMaxZ()), minZ + 0.2);

    this.cropMinX.set(minX);
    this.cropMaxX.set(maxX);
    this.cropMinY.set(minY);
    this.cropMaxY.set(maxY);
    this.cropMinZ.set(minZ);
    this.cropMaxZ.set(maxZ);

    const bounds: [number, number, number, number, number, number] = [
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ
    ];
    this.sendToEditor('studio:setCropBox', { bounds });
    this.persistCurrentRoomToConfig();
  }

  resetCropBox(): void {
    this.cropMinX.set(-15);
    this.cropMaxX.set(15);
    this.cropMinY.set(-5);
    this.cropMaxY.set(8);
    this.cropMinZ.set(-15);
    this.cropMaxZ.set(15);
    this.onCropBoxChange();
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
    const roomId = this.activeRoomId();
    const targetId = this.hotspotTargetRoomId();
    const targetRoom = this.scanPreview()?.rooms.find((r) => r.roomId === targetId);
    const targetName = targetRoom?.roomLabel || 'الغرفة الهدف';
    const title = this.hotspotTitle() || `الانتقال إلى ${targetName}`;

    const newHotspot: SceneHotspotDto = {
      id: 'hs_' + Math.random().toString(36).substring(2, 9),
      sourceRoomId: roomId,
      targetRoomId: targetId,
      title,
      position: coords
    };

    const current = { ...this.roomStates() };
    const st = current[roomId];
    if (st) {
      current[roomId] = { ...st, links: [...st.links, newHotspot] };
      this.roomStates.set(current);
    }

    this.isPlacingHotspot.set(false);
    this.hotspotTitle.set('');
  }

  removeHotspot(hotspotId: string): void {
    const roomId = this.activeRoomId();
    const current = { ...this.roomStates() };
    const st = current[roomId];
    if (st) {
      current[roomId] = { ...st, links: st.links.filter((h) => h.id !== hotspotId) };
      this.roomStates.set(current);
    }
  }

  saveSceneConfig(): void {
    const id = this.scanId();
    if (!id) return;

    this.persistCurrentRoomToConfig();
    const states = this.roomStates();
    const scenes: SceneItemDto[] = Object.entries(states).map(([roomId, st]) => ({
      roomId,
      roomLabel: st.roomLabel,
      sortOrder: st.sortOrder,
      cameraPosition: st.cameraPosition ?? null,
      cameraTarget: st.cameraTarget ?? null,
      hotspots: {
        cropBounds: st.cropBounds,
        floorTiltDegrees: st.floorTiltDegrees,
        links: st.links
      }
    }));

    if (scenes.length === 0) {
      this.error.set('لا توجد غرف متاحة لحفظ إعدادات المشهد.');
      return;
    }

    const defaultId = this.defaultSceneId() || this.activeRoomId() || scenes[0].roomId;

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.conflictError.set(null);
    this.error.set(null);

    this.scansService.updateSceneConfig(id, {
      expectedVersion: this.expectedVersion(),
      defaultSceneId: defaultId,
      eyeHeightMeters: Math.min(3.0, Math.max(0.5, this.eyeHeightMeters() || 1.6)),
      scenes
    }).subscribe({
      next: (updatedConfig: SceneConfigurationDto) => {
        this.saving.set(false);
        this.saveSuccess.set(true);
        this.expectedVersion.set(updatedConfig.version);
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        this.saving.set(false);
        if (err.status === 409) {
          this.conflictError.set('تم تعديل هذا المشهد بواسطة مستخدم آخر. الإصدار المتوقع لم يعد متطابقاً مع قاعدة البيانات.');
        } else {
          this.error.set(extractApiErrorMessage(err, 'فشل حفظ إعدادات المشهد.'));
          setTimeout(() => this.error.set(null), 5000);
        }
      }
    });
  }

  reloadLatestVersion(): void {
    this.conflictError.set(null);
    this.loadScanPreview();
  }

  private sendToEditor(type: string, payload?: unknown): void {
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
          const current = [
            this.cropMinX(),
            this.cropMaxX(),
            this.cropMinY(),
            this.cropMaxY(),
            this.cropMinZ(),
            this.cropMaxZ()
          ];
          if (data.bounds.every((v: number, idx: number) => v === current[idx])) {
            break;
          }
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
