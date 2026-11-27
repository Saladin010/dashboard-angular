import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
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
import { Observable, Subscription, of, switchMap } from 'rxjs';

import { ScansService } from '../../core/services/scans.service';
import { PropertiesService } from '../../core/services/properties.service';
import { API_CONFIG } from '../../core/config/api.config';
import { extractApiErrorMessage } from '../../core/utils/api-error.util';
import {
  ScanPreviewDto,
  SceneConfigurationDto,
  SceneItemDto,
  SceneItemHotspotsPayload,
  SceneHotspotDto,
  RoomTransformDto,
  RoomSpawnPoseDto,
  AssemblyHotspotDto,
  CropBoxBoundsTuple,
  PropertyStudioSessionDto,
  PropertyStudioSessionRoomDto,
  PropertyAssemblyStudioDto,
  PropertyAssemblyDto,
  SavePropertyAssemblyRequest
} from '../../core/models/scan.model';
import { PropertyDto } from '../../core/models/property.model';

export type StudioMode = 'assembly' | 'legacy' | 'picker';
export type GizmoMode = 'translate' | 'rotate' | 'scale' | 'none';

export interface AssembledRoomState {
  instanceId: string;
  sourceScanId: string;
  roomId: string;
  displayLabel: string;
  sortOrder: number;
  signedModelUrl?: string | null;
  gaussianCount?: number | null;
  transform: RoomTransformDto;
  cropBounds: CropBoxBoundsTuple | null;
  spawnPose: RoomSpawnPoseDto | null;
  hotspots: AssemblyHotspotDto[];
  visible: boolean;
}

interface RoomStudioState {
  roomLabel: string;
  sortOrder: number;
  cropBounds: CropBoxBoundsTuple;
  floorTiltDegrees: number;
  cameraPosition?: number[];
  cameraTarget?: number[];
  links: SceneHotspotDto[];
}

const DEFAULT_OPEN_CROP: CropBoxBoundsTuple = [-15, 15, -5, 8, -15, 15];
const DEFAULT_LEGACY_CROP: CropBoxBoundsTuple = [-5, 5, -2, 4, -5, 5];

function cloneTransform(t?: Partial<RoomTransformDto> | null): RoomTransformDto {
  const pos = Array.isArray(t?.position) && t.position.length === 3 ? t.position : [0, 0, 0];
  const rot = Array.isArray(t?.rotationEulerDeg) && t.rotationEulerDeg.length === 3 ? t.rotationEulerDeg : [0, 0, 0];
  const scale = typeof t?.scale === 'number' && Number.isFinite(t.scale) && t.scale > 0 ? t.scale : 1;
  return {
    position: [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0],
    rotationEulerDeg: [Number(rot[0]) || 0, Number(rot[1]) || 0, Number(rot[2]) || 0],
    scale
  };
}

function toCropTuple(bounds?: number[] | null): CropBoxBoundsTuple | null {
  if (!Array.isArray(bounds) || bounds.length !== 6) return null;
  return [
    Number(bounds[0]) || 0,
    Number(bounds[1]) || 0,
    Number(bounds[2]) || 0,
    Number(bounds[3]) || 0,
    Number(bounds[4]) || 0,
    Number(bounds[5]) || 0
  ];
}

function generateInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
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

  readonly MAX_ROOMS_BUDGET = 8;
  readonly MAX_TRIANGLES_BUDGET = 2_000_000;

  // Mode & Identifiers
  readonly studioMode = signal<StudioMode>('picker');
  readonly propertyId = signal<string>('');
  readonly scanId = signal<string>('');

  // Shared Status Signals
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly editorReady = signal<boolean>(false);
  readonly isDirty = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly publishing = signal<boolean>(false);
  readonly saveSuccess = signal<boolean>(false);
  readonly publishSuccess = signal<string | null>(null);
  readonly conflictError = signal<string | null>(null);
  readonly spawnSavedToast = signal<boolean>(false);

  // Picker Mode (/studio with no params — single-request property picker, fixes CRIT-04)
  readonly availableProperties = signal<PropertyDto[]>([]);

  // Assembly Mode Signals
  readonly assemblyStudio = signal<PropertyAssemblyStudioDto | null>(null);
  readonly assemblyStatus = signal<string>('Draft');
  readonly sessions = signal<PropertyStudioSessionDto[]>([]);
  readonly expandedSessionIds = signal<Set<string>>(new Set());
  readonly assembledRoomsMap = signal<Map<string, AssembledRoomState>>(new Map());
  readonly roomOrder = signal<string[]>([]);
  readonly activeInstanceId = signal<string>('');
  readonly defaultInstanceId = signal<string>('');
  readonly gizmoMode = signal<GizmoMode>('translate');
  readonly editorTotalTriangles = signal<number | null>(null);
  readonly assemblyLoadProgress = signal<{ loaded: number; total: number } | null>(null);

  // Legacy Single-Scan Mode Signals
  readonly scanPreview = signal<ScanPreviewDto | null>(null);
  readonly activeRoomId = signal<string>('');
  readonly expectedVersion = signal<number>(0);
  readonly eyeHeightMeters = signal<number>(1.6);
  readonly defaultSceneId = signal<string>('');
  private readonly roomStates = signal<Record<string, RoomStudioState>>({});

  // 6-DOF Crop Box Sliders (shared UI bindings for active room)
  readonly cropMinX = signal<number>(-5);
  readonly cropMaxX = signal<number>(5);
  readonly cropMinY = signal<number>(-2);
  readonly cropMaxY = signal<number>(4);
  readonly cropMinZ = signal<number>(-5);
  readonly cropMaxZ = signal<number>(5);

  // Legacy Floor tilt & Spawn Pose
  readonly floorTilt = signal<number>(0);
  readonly spawnPose = signal<number[] | null>(null);

  // Hotspot Placement
  readonly isPlacingHotspot = signal<boolean>(false);
  readonly hotspotTargetRoomId = signal<string>('');
  readonly hotspotTargetInstanceId = signal<string>('');
  readonly hotspotTitle = signal<string>('');

  private routeSub?: Subscription;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private spawnTimer: ReturnType<typeof setTimeout> | null = null;

  readonly editorSafeUrl = computed<SafeResourceUrl>(() => {
    const base = API_CONFIG.studioBaseUrl || 'https://studio-editor-dmx.pages.dev';
    return this.sanitizer.bypassSecurityTrustResourceUrl(base);
  });

  // MED-01: O(1) Map lookups for sessions & assembled rooms
  readonly sessionInfoMap = computed<Map<string, PropertyStudioSessionDto>>(() => {
    const map = new Map<string, PropertyStudioSessionDto>();
    for (const s of this.sessions()) {
      map.set(s.scanJobId, s);
    }
    return map;
  });

  readonly sessionRoomMetaMap = computed<Map<string, PropertyStudioSessionRoomDto>>(() => {
    const map = new Map<string, PropertyStudioSessionRoomDto>();
    for (const s of this.sessions()) {
      for (const r of s.rooms || []) {
        map.set(`${s.scanJobId}:${r.roomId}`, r);
      }
    }
    return map;
  });

  readonly assembledRooms = computed<AssembledRoomState[]>(() => {
    const map = this.assembledRoomsMap();
    const result: AssembledRoomState[] = [];
    for (const id of this.roomOrder()) {
      const item = map.get(id);
      if (item) result.push(item);
    }
    return result;
  });

  readonly activeAssemblyRoom = computed<AssembledRoomState | null>(() => {
    const id = this.activeInstanceId();
    if (!id) return null;
    return this.assembledRoomsMap().get(id) ?? null;
  });

  readonly otherAssemblyRooms = computed<AssembledRoomState[]>(() => {
    const activeId = this.activeInstanceId();
    return this.assembledRooms().filter((r) => r.instanceId !== activeId);
  });

  readonly activeAssemblyHotspots = computed<AssemblyHotspotDto[]>(() => {
    return this.activeAssemblyRoom()?.hotspots ?? [];
  });

  readonly estimatedTriangles = computed<number>(() => {
    const reported = this.editorTotalTriangles();
    if (reported !== null && reported > 0) {
      return reported;
    }
    const metaMap = this.sessionRoomMetaMap();
    let total = 0;
    for (const room of this.assembledRooms()) {
      const count =
        room.gaussianCount ??
        metaMap.get(`${room.sourceScanId}:${room.roomId}`)?.gaussianCount ??
        0;
      total += Math.max(0, count);
    }
    return total;
  });

  readonly isRoomBudgetExceeded = computed<boolean>(
    () => this.assembledRooms().length > this.MAX_ROOMS_BUDGET
  );

  readonly isTriangleBudgetExceeded = computed<boolean>(
    () => this.estimatedTriangles() > this.MAX_TRIANGLES_BUDGET
  );

  readonly isOverBudget = computed<boolean>(
    () => this.isRoomBudgetExceeded() || this.isTriangleBudgetExceeded()
  );

  readonly hasVisibleAssemblyRoom = computed<boolean>(
    () => this.assembledRooms().some((r) => r.visible)
  );

  readonly currentRoomHotspots = computed<SceneHotspotDto[]>(() => {
    const currentId = this.activeRoomId();
    return this.roomStates()[currentId]?.links || [];
  });

  readonly otherRooms = computed(() => {
    const currentId = this.activeRoomId();
    return (this.scanPreview()?.rooms || []).filter((r) => r.roomId !== currentId);
  });

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  canDeactivate(): boolean {
    if (!this.isDirty()) return true;
    return window.confirm('لديك تعديلات غير محفوظة في الاستوديو ثلاثي الأبعاد. هل تريد المغادرة دون حفظ؟');
  }

  ngOnInit(): void {
    window.addEventListener('message', this.handleWindowMessage);

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const propId = params.get('propertyId') || this.route.snapshot.queryParamMap.get('propertyId') || '';
      const scanId = params.get('scanId') || this.route.snapshot.queryParamMap.get('scanId') || '';

      if (propId) {
        this.studioMode.set('assembly');
        this.propertyId.set(propId);
        this.scanId.set('');
        this.loadAssemblyStudio();
      } else if (scanId) {
        this.studioMode.set('legacy');
        this.scanId.set(scanId);
        this.propertyId.set('');
        this.loadScanPreview();
      } else {
        this.studioMode.set('picker');
        this.propertyId.set('');
        this.scanId.set('');
        this.loading.set(false);
        this.loadAvailableProperties();
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('message', this.handleWindowMessage);
    this.routeSub?.unsubscribe();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
  }

  // CRIT-04 Fix: Single paginated request instead of O(P) fan-out
  private loadAvailableProperties(): void {
    this.propertiesService.getProperties({ pageSize: 20 }).subscribe({
      next: (res) => {
        this.availableProperties.set(res.items || []);
      },
      error: (err) => {
        this.error.set(extractApiErrorMessage(err, 'تعذر تحميل قائمة العقارات.'));
      }
    });
  }

  onSelectAvailableProperty(propertyId: string): void {
    if (!propertyId) return;
    this.router.navigate(['/studio/property', propertyId]);
  }

  onIframeLoaded(): void {
    this.sendToEditor('studio:ping');
    if (this.studioMode() === 'assembly' && this.assemblyStudio()) {
      this.syncAssemblyToEditor();
    } else if (this.studioMode() === 'legacy' && this.scanPreview() && this.activeRoomId()) {
      this.syncActiveRoomToEditor();
    }
  }

  // ==========================================
  // PROPERTY ASSEMBLY MODE
  // ==========================================

  loadAssemblyStudio(): void {
    const propId = this.propertyId();
    if (!propId) return;

    this.loading.set(true);
    this.error.set(null);
    this.conflictError.set(null);
    this.publishSuccess.set(null);

    this.scansService.getPropertyAssemblyStudio(propId).subscribe({
      next: (dto) => {
        this.loading.set(false);
        this.assemblyStudio.set(dto);
        this.sessions.set(dto.sessions || []);

        const expanded = new Set<string>();
        const firstWithGlb = (dto.sessions || []).find((s) => s.completedGlbRoomsCount > 0) ?? dto.sessions?.[0];
        if (firstWithGlb) expanded.add(firstWithGlb.scanJobId);
        this.expandedSessionIds.set(expanded);

        const assembly = dto.assembly;
        this.assemblyStatus.set(assembly?.status || 'Draft');
        this.expectedVersion.set(assembly?.version ?? 0);
        this.eyeHeightMeters.set(assembly?.eyeHeightMeters ?? 1.6);

        const nextMap = new Map<string, AssembledRoomState>();
        const order: string[] = [];

        const sortedRooms = [...(assembly?.rooms || [])].sort((a, b) => a.sortOrder - b.sortOrder);
        for (const r of sortedRooms) {
          const state: AssembledRoomState = {
            instanceId: r.instanceId,
            sourceScanId: r.sourceScanId,
            roomId: r.roomId,
            displayLabel: r.displayLabel || r.roomId,
            sortOrder: r.sortOrder ?? order.length,
            signedModelUrl: r.signedModelUrl ?? null,
            gaussianCount: r.gaussianCount ?? null,
            transform: cloneTransform(r.transform),
            cropBounds: toCropTuple(r.cropBounds),
            spawnPose: r.spawnPose
              ? {
                  position: [...r.spawnPose.position] as [number, number, number],
                  target: [...r.spawnPose.target] as [number, number, number],
                  fov: r.spawnPose.fov || 60
                }
              : null,
            hotspots: (r.hotspots || []).map((h) => ({ ...h })),
            visible: r.visible !== false
          };
          nextMap.set(state.instanceId, state);
          order.push(state.instanceId);
        }

        this.assembledRoomsMap.set(nextMap);
        this.roomOrder.set(order);

        const defaultId =
          assembly?.defaultInstanceId && nextMap.has(assembly.defaultInstanceId)
            ? assembly.defaultInstanceId
            : order[0] || '';
        this.defaultInstanceId.set(defaultId);
        this.activeInstanceId.set(defaultId);
        this.editorTotalTriangles.set(null);
        this.assemblyLoadProgress.set(null);
        this.isDirty.set(false);

        const active = defaultId ? nextMap.get(defaultId) ?? null : null;
        this.applyAssemblyCropSliders(active);
        this.refreshHotspotTargetDefault();

        if (this.editorReady()) {
          this.syncAssemblyToEditor();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractApiErrorMessage(err, 'فشل تحميل استوديو تجميع العقار ثلاثي الأبعاد.'));
      }
    });
  }

  toggleSessionAccordion(scanJobId: string): void {
    const next = new Set(this.expandedSessionIds());
    if (next.has(scanJobId)) {
      next.delete(scanJobId);
    } else {
      next.add(scanJobId);
    }
    this.expandedSessionIds.set(next);
  }

  isSessionExpanded(scanJobId: string): boolean {
    return this.expandedSessionIds().has(scanJobId);
  }

  addRoomFromSession(session: PropertyStudioSessionDto, room: PropertyStudioSessionRoomDto): void {
    if (!room.isSelectable || !room.isGlb || !room.signedModelUrl) {
      return;
    }

    const instanceId = generateInstanceId();
    const existingRooms = this.assembledRooms();
    const duplicateCount = existingRooms.filter(
      (r) => r.roomId === room.roomId || r.displayLabel.startsWith(room.roomLabel)
    ).length;
    const displayLabel =
      duplicateCount > 0 ? `${room.roomLabel} (${duplicateCount + 1})` : room.roomLabel;

    const newRoom: AssembledRoomState = {
      instanceId,
      sourceScanId: session.scanJobId,
      roomId: room.roomId,
      displayLabel,
      sortOrder: existingRooms.length,
      signedModelUrl: room.signedModelUrl,
      gaussianCount: room.gaussianCount ?? null,
      transform: {
        position: [0, 0, 0],
        rotationEulerDeg: [0, 0, 0],
        scale: 1
      },
      cropBounds: null,
      spawnPose: null,
      hotspots: [],
      visible: true
    };

    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(instanceId, newRoom);
    this.assembledRoomsMap.set(nextMap);
    this.roomOrder.set([...this.roomOrder(), instanceId]);
    this.activeInstanceId.set(instanceId);

    if (!this.defaultInstanceId()) {
      this.defaultInstanceId.set(instanceId);
    }

    this.applyAssemblyCropSliders(newRoom);
    this.refreshHotspotTargetDefault();
    this.isDirty.set(true);

    this.sendToEditor('studio:addRoomInstance', {
      instanceId: newRoom.instanceId,
      signedModelUrl: newRoom.signedModelUrl,
      displayLabel: newRoom.displayLabel,
      transform: newRoom.transform,
      cropBounds: null,
      visible: true,
      select: true,
      focus: true
    });
  }

  selectAssemblyRoom(instanceId: string, focus = false): void {
    const room = this.assembledRoomsMap().get(instanceId);
    if (!room) return;

    this.activeInstanceId.set(instanceId);
    this.applyAssemblyCropSliders(room);
    this.refreshHotspotTargetDefault();

    this.sendToEditor('studio:selectRoomInstance', { instanceId, focus });
  }

  setDefaultInstance(instanceId: string): void {
    if (!this.assembledRoomsMap().has(instanceId)) return;
    this.defaultInstanceId.set(instanceId);
    this.isDirty.set(true);
  }

  updateRoomDisplayLabel(instanceId: string, label: string): void {
    const existing = this.assembledRoomsMap().get(instanceId);
    if (!existing) return;
    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(instanceId, { ...existing, displayLabel: label });
    this.assembledRoomsMap.set(nextMap);
    this.isDirty.set(true);
  }

  toggleRoomVisibility(instanceId: string): void {
    const existing = this.assembledRoomsMap().get(instanceId);
    if (!existing) return;
    const visible = !existing.visible;
    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(instanceId, { ...existing, visible });
    this.assembledRoomsMap.set(nextMap);
    this.isDirty.set(true);
    this.sendToEditor('studio:setRoomVisibility', { instanceId, visible });
  }

  removeAssemblyRoom(instanceId: string): void {
    const currentMap = this.assembledRoomsMap();
    if (!currentMap.has(instanceId)) return;

    const nextMap = new Map<string, AssembledRoomState>();
    for (const [id, room] of currentMap.entries()) {
      if (id === instanceId) continue;
      // Clean up hotspots targeting the removed room instance
      const cleanedHotspots = room.hotspots.filter((h) => h.targetInstanceId !== instanceId);
      nextMap.set(id, { ...room, hotspots: cleanedHotspots });
    }

    const nextOrder = this.roomOrder().filter((id) => id !== instanceId);
    nextOrder.forEach((id, idx) => {
      const r = nextMap.get(id);
      if (r) nextMap.set(id, { ...r, sortOrder: idx });
    });

    this.assembledRoomsMap.set(nextMap);
    this.roomOrder.set(nextOrder);

    if (this.defaultInstanceId() === instanceId) {
      this.defaultInstanceId.set(nextOrder[0] || '');
    }
    if (this.activeInstanceId() === instanceId) {
      const fallbackId = nextOrder[0] || '';
      this.activeInstanceId.set(fallbackId);
      this.applyAssemblyCropSliders(fallbackId ? nextMap.get(fallbackId) ?? null : null);
    }

    if (this.hotspotTargetInstanceId() === instanceId) {
      this.hotspotTargetInstanceId.set('');
      this.refreshHotspotTargetDefault();
    }

    this.editorTotalTriangles.set(null);
    this.isDirty.set(true);
    this.sendToEditor('studio:removeRoomInstance', { instanceId });
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmoMode.set(mode);
    this.sendToEditor('studio:setGizmoMode', { mode });
  }

  onTransformPositionChange(axis: 0 | 1 | 2, rawValue: number | string): void {
    const val = Number(rawValue);
    if (!Number.isFinite(val)) return;
    this.updateActiveRoomTransform((prev) => {
      const pos: [number, number, number] = [...prev.position];
      pos[axis] = Number(val.toFixed(3));
      return { ...prev, position: pos };
    });
  }

  onTransformRotationChange(axis: 0 | 1 | 2, rawValue: number | string): void {
    const val = Number(rawValue);
    if (!Number.isFinite(val)) return;
    this.updateActiveRoomTransform((prev) => {
      const rot: [number, number, number] = [...prev.rotationEulerDeg];
      rot[axis] = Number(val.toFixed(2));
      return { ...prev, rotationEulerDeg: rot };
    });
  }

  onTransformScaleChange(rawValue: number | string): void {
    const val = Number(rawValue);
    if (!Number.isFinite(val)) return;
    const clamped = Math.max(0.05, Math.min(20, Number(val.toFixed(3))));
    this.updateActiveRoomTransform((prev) => ({ ...prev, scale: clamped }));
  }

  updateActiveRoomTransform(
    updater: (prev: RoomTransformDto) => RoomTransformDto,
    sendToIframe = true
  ): void {
    const id = this.activeInstanceId();
    if (!id) return;
    const existing = this.assembledRoomsMap().get(id);
    if (!existing) return;

    const nextTransform = updater(existing.transform);
    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(id, { ...existing, transform: nextTransform });
    this.assembledRoomsMap.set(nextMap);
    this.isDirty.set(true);

    if (sendToIframe) {
      this.sendToEditor('studio:setRoomTransform', {
        instanceId: id,
        transform: nextTransform
      });
    }
  }

  alignActiveRoomFloorY(toZero = false): void {
    const activeId = this.activeInstanceId();
    if (!activeId) return;

    const rooms = this.assembledRooms();
    const defaultId = this.defaultInstanceId();
    const referenceRoom = !toZero
      ? rooms.find((r) => r.instanceId === defaultId && r.instanceId !== activeId) ??
        rooms.find((r) => r.instanceId !== activeId)
      : undefined;

    this.sendToEditor('studio:alignFloorY', {
      instanceId: activeId,
      ...(referenceRoom ? { referenceInstanceId: referenceRoom.instanceId } : { targetFloorY: 0 })
    });
  }

  previewRoomSpawnPose(room: AssembledRoomState): void {
    if (!room.spawnPose) return;
    this.sendToEditor('studio:setCameraPose', {
      position: room.spawnPose.position,
      target: room.spawnPose.target,
      fov: room.spawnPose.fov || 60
    });
  }

  private applyAssemblyCropSliders(room: AssembledRoomState | null): void {
    const b = room?.cropBounds ?? DEFAULT_OPEN_CROP;
    this.cropMinX.set(b[0]);
    this.cropMaxX.set(b[1]);
    this.cropMinY.set(b[2]);
    this.cropMaxY.set(b[3]);
    this.cropMinZ.set(b[4]);
    this.cropMaxZ.set(b[5]);
  }

  private syncAssemblyToEditor(): void {
    const rooms = this.assembledRooms()
      .filter((r) => !!r.signedModelUrl)
      .map((r) => ({
        instanceId: r.instanceId,
        signedModelUrl: r.signedModelUrl!,
        displayLabel: r.displayLabel,
        transform: r.transform,
        cropBounds: r.cropBounds,
        visible: r.visible
      }));

    this.sendToEditor('studio:loadAssemblyRooms', {
      rooms,
      activeInstanceId: this.activeInstanceId() || undefined,
      concurrency: 3
    });
    this.sendToEditor('studio:setGizmoMode', { mode: this.gizmoMode() });
  }

  private applyInboundRoomTransform(
    instanceId: string,
    transform: Partial<RoomTransformDto>,
    isFinal: boolean
  ): void {
    const existing = this.assembledRoomsMap().get(instanceId);
    if (!existing) return;

    const merged = cloneTransform({
      position: transform.position ?? existing.transform.position,
      rotationEulerDeg: transform.rotationEulerDeg ?? existing.transform.rotationEulerDeg,
      scale: transform.scale ?? existing.transform.scale
    });

    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(instanceId, { ...existing, transform: merged });
    this.assembledRoomsMap.set(nextMap);

    if (isFinal) {
      this.isDirty.set(true);
    }
  }

  private refreshHotspotTargetDefault(): void {
    if (this.studioMode() === 'assembly') {
      const others = this.otherAssemblyRooms();
      const current = this.hotspotTargetInstanceId();
      if (others.length > 0 && (!current || !others.some((o) => o.instanceId === current))) {
        this.hotspotTargetInstanceId.set(others[0].instanceId);
      } else if (others.length === 0) {
        this.hotspotTargetInstanceId.set('');
      }
    } else {
      const others = this.otherRooms();
      if (others.length > 0) {
        this.hotspotTargetRoomId.set(others[0].roomId);
      }
    }
  }

  private buildSaveAssemblyRequest(): SavePropertyAssemblyRequest {
    const rooms = this.assembledRooms().map((r, idx) => ({
      instanceId: r.instanceId,
      sourceScanId: r.sourceScanId,
      roomId: r.roomId,
      displayLabel: r.displayLabel.trim() || r.roomId,
      sortOrder: idx,
      transform: cloneTransform(r.transform),
      cropBounds: r.cropBounds ? [...r.cropBounds] : null,
      spawnPose: r.spawnPose
        ? {
            position: [...r.spawnPose.position] as [number, number, number],
            target: [...r.spawnPose.target] as [number, number, number],
            fov: r.spawnPose.fov || 60
          }
        : null,
      hotspots: (r.hotspots || []).map((h) => ({ ...h })),
      visible: r.visible
    }));

    const defaultId =
      this.defaultInstanceId() && this.assembledRoomsMap().has(this.defaultInstanceId())
        ? this.defaultInstanceId()
        : this.activeInstanceId() || rooms[0]?.instanceId || null;

    return {
      expectedVersion: this.expectedVersion(),
      defaultInstanceId: defaultId,
      eyeHeightMeters: Math.min(3.0, Math.max(0.5, this.eyeHeightMeters() || 1.6)),
      rooms
    };
  }

  saveAssembly(): void {
    const propId = this.propertyId();
    if (!propId) return;

    this.saving.set(true);
    this.saveSuccess.set(false);
    this.publishSuccess.set(null);
    this.conflictError.set(null);
    this.error.set(null);

    const req = this.buildSaveAssemblyRequest();
    this.scansService.savePropertyAssembly(propId, req).subscribe({
      next: (saved: PropertyAssemblyDto) => {
        this.saving.set(false);
        this.saveSuccess.set(true);
        this.expectedVersion.set(saved.version);
        this.assemblyStatus.set(saved.status || 'Draft');
        this.isDirty.set(false);
        this.triggerSaveSuccessToast();
      },
      error: (err) => {
        this.saving.set(false);
        if (err.status === 409) {
          this.conflictError.set(
            'تم تعديل تجميع هذا العقار بواسطة مستخدم آخر. الإصدار المتوقع لم يعد متطابقاً مع قاعدة البيانات.'
          );
        } else {
          this.error.set(extractApiErrorMessage(err, 'فشل حفظ مسودة تجميع العقار.'));
          this.autoClearError();
        }
      }
    });
  }

  publishAssembly(): void {
    const propId = this.propertyId();
    if (!propId) return;

    if (!this.hasVisibleAssemblyRoom()) {
      this.error.set('يجب إضافة غرفة مرئية واحدة على الأقل إلى المشهد قبل نشر الجولة 3D.');
      this.autoClearError();
      return;
    }

    this.publishing.set(true);
    this.saveSuccess.set(false);
    this.publishSuccess.set(null);
    this.conflictError.set(null);
    this.error.set(null);

    const saveFirst$: Observable<PropertyAssemblyDto | null> = this.isDirty()
      ? this.scansService.savePropertyAssembly(propId, this.buildSaveAssemblyRequest())
      : of(null);

    saveFirst$
      .pipe(
        switchMap((saved) => {
          if (saved) {
            this.expectedVersion.set(saved.version);
            this.assemblyStatus.set(saved.status || 'Draft');
            this.isDirty.set(false);
          }
          return this.scansService.publishPropertyAssembly(propId);
        })
      )
      .subscribe({
        next: (res) => {
          this.publishing.set(false);
          this.assemblyStatus.set(res.assemblyStatus || 'Published');
          this.expectedVersion.set(res.version);
          this.isDirty.set(false);
          this.publishSuccess.set('تم نشر الجولة ثلاثية الأبعاد للعقار وتفعيلها للعرض العام بنجاح!');
          if (this.toastTimer) clearTimeout(this.toastTimer);
          this.toastTimer = setTimeout(() => this.publishSuccess.set(null), 5000);
        },
        error: (err) => {
          this.publishing.set(false);
          if (err.status === 409) {
            this.conflictError.set(
              'تم تعديل تجميع هذا العقار بواسطة مستخدم آخر. يرجى إعادة تحميل أحدث نسخة قبل النشر.'
            );
          } else {
            this.error.set(extractApiErrorMessage(err, 'فشل نشر الجولة ثلاثية الأبعاد للعقار.'));
            this.autoClearError();
          }
        }
      });
  }

  // ==========================================
  // SHARED / DUAL-MODE CONTROLS
  // ==========================================

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

    const bounds: CropBoxBoundsTuple = [minX, maxX, minY, maxY, minZ, maxZ];

    if (this.studioMode() === 'assembly') {
      const id = this.activeInstanceId();
      const existing = id ? this.assembledRoomsMap().get(id) : undefined;
      if (existing) {
        const nextMap = new Map(this.assembledRoomsMap());
        nextMap.set(id, { ...existing, cropBounds: bounds });
        this.assembledRoomsMap.set(nextMap);
        this.isDirty.set(true);
        this.sendToEditor('studio:setRoomCropBox', { instanceId: id, bounds });
      }
      return;
    }

    this.isDirty.set(true);
    this.sendToEditor('studio:setCropBox', { bounds });
    this.persistCurrentRoomToConfig();
  }

  resetCropBox(): void {
    this.cropMinX.set(DEFAULT_OPEN_CROP[0]);
    this.cropMaxX.set(DEFAULT_OPEN_CROP[1]);
    this.cropMinY.set(DEFAULT_OPEN_CROP[2]);
    this.cropMaxY.set(DEFAULT_OPEN_CROP[3]);
    this.cropMinZ.set(DEFAULT_OPEN_CROP[4]);
    this.cropMaxZ.set(DEFAULT_OPEN_CROP[5]);

    if (this.studioMode() === 'assembly') {
      const id = this.activeInstanceId();
      const existing = id ? this.assembledRoomsMap().get(id) : undefined;
      if (existing) {
        const nextMap = new Map(this.assembledRoomsMap());
        nextMap.set(id, { ...existing, cropBounds: null });
        this.assembledRoomsMap.set(nextMap);
        this.isDirty.set(true);
        this.sendToEditor('studio:setRoomCropBox', { instanceId: id, bounds: null });
      }
      return;
    }

    this.onCropBoxChange();
  }

  captureEyeLevelSpawn(): void {
    if (this.studioMode() === 'assembly') {
      const id = this.activeInstanceId();
      if (!id) return;
      this.sendToEditor('studio:captureSpawnPose', { instanceId: id });
      return;
    }
    this.sendToEditor('studio:captureSpawnPose');
  }

  calibrateDoorScale(): void {
    if (this.studioMode() === 'assembly') {
      const id = this.activeInstanceId();
      if (!id) return;
      this.sendToEditor('studio:calibrateDoorScale', { doorHeightMeters: 2.1, instanceId: id });
      return;
    }
    this.sendToEditor('studio:calibrateDoorScale', { doorHeightMeters: 2.1 });
  }

  startHotspotPlacement(): void {
    if (this.studioMode() === 'assembly') {
      const others = this.otherAssemblyRooms();
      if (others.length === 0) return;
      if (!this.hotspotTargetInstanceId()) {
        this.hotspotTargetInstanceId.set(others[0].instanceId);
      }
      this.isPlacingHotspot.set(true);
      this.sendToEditor('studio:enableSplatPick');
      return;
    }

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

  private addAssemblyHotspotAtCoords(
    coords: [number, number, number],
    pickedInstanceId?: string | null
  ): void {
    const sourceId =
      pickedInstanceId && this.assembledRoomsMap().has(pickedInstanceId)
        ? pickedInstanceId
        : this.activeInstanceId();
    const targetId = this.hotspotTargetInstanceId();
    const sourceRoom = this.assembledRoomsMap().get(sourceId);
    const targetRoom = this.assembledRoomsMap().get(targetId);

    if (!sourceRoom || !targetId) {
      this.isPlacingHotspot.set(false);
      return;
    }

    const label = this.hotspotTitle().trim() || `الانتقال إلى ${targetRoom?.displayLabel || 'الغرفة الهدف'}`;
    const newHotspot: AssemblyHotspotDto = {
      id: 'hs_' + Math.random().toString(36).substring(2, 9),
      label,
      position: coords,
      targetInstanceId: targetId,
      targetPose: targetRoom?.spawnPose ?? null
    };

    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(sourceId, {
      ...sourceRoom,
      hotspots: [...sourceRoom.hotspots, newHotspot]
    });
    this.assembledRoomsMap.set(nextMap);
    this.isDirty.set(true);
    this.isPlacingHotspot.set(false);
    this.hotspotTitle.set('');
  }

  removeAssemblyHotspot(hotspotId: string): void {
    const id = this.activeInstanceId();
    const room = this.assembledRoomsMap().get(id);
    if (!room) return;

    const nextMap = new Map(this.assembledRoomsMap());
    nextMap.set(id, {
      ...room,
      hotspots: room.hotspots.filter((h) => h.id !== hotspotId)
    });
    this.assembledRoomsMap.set(nextMap);
    this.isDirty.set(true);
  }

  // ==========================================
  // LEGACY SINGLE-SCAN MODE (/studio/:scanId)
  // ==========================================

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

        const nextStates: Record<string, RoomStudioState> = {};
        const scenesByRoomId = new Map<string, SceneItemDto>();
        for (const s of cfg?.scenes || []) {
          scenesByRoomId.set(s.roomId, s);
        }

        for (const r of preview.rooms || []) {
          const existing = scenesByRoomId.get(r.roomId);
          const hsRaw = existing?.hotspots;
          let cropBounds: CropBoxBoundsTuple = [...DEFAULT_LEGACY_CROP];
          let floorTiltDegrees = 0;
          let links: SceneHotspotDto[] = [];

          if (Array.isArray(hsRaw)) {
            links = hsRaw;
          } else if (hsRaw && typeof hsRaw === 'object') {
            const payload = hsRaw as SceneItemHotspotsPayload;
            if (Array.isArray(payload.cropBounds) && payload.cropBounds.length === 6) {
              cropBounds = payload.cropBounds as CropBoxBoundsTuple;
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
        this.isDirty.set(false);

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
      this.cropMinX.set(DEFAULT_LEGACY_CROP[0]);
      this.cropMaxX.set(DEFAULT_LEGACY_CROP[1]);
      this.cropMinY.set(DEFAULT_LEGACY_CROP[2]);
      this.cropMaxY.set(DEFAULT_LEGACY_CROP[3]);
      this.cropMinZ.set(DEFAULT_LEGACY_CROP[4]);
      this.cropMaxZ.set(DEFAULT_LEGACY_CROP[5]);
      this.floorTilt.set(0);
      this.spawnPose.set(null);
    }

    this.refreshHotspotTargetDefault();
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

    const bounds: CropBoxBoundsTuple = [
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

  onFloorTiltChange(): void {
    this.isDirty.set(true);
    this.sendToEditor('studio:setFloorTilt', { degrees: this.floorTilt() });
    this.persistCurrentRoomToConfig();
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
      this.isDirty.set(true);
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
      this.isDirty.set(true);
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

    this.scansService
      .updateSceneConfig(id, {
        expectedVersion: this.expectedVersion(),
        defaultSceneId: defaultId,
        eyeHeightMeters: Math.min(3.0, Math.max(0.5, this.eyeHeightMeters() || 1.6)),
        scenes
      })
      .subscribe({
        next: (updatedConfig: SceneConfigurationDto) => {
          this.saving.set(false);
          this.saveSuccess.set(true);
          this.expectedVersion.set(updatedConfig.version);
          this.isDirty.set(false);
          this.triggerSaveSuccessToast();
        },
        error: (err) => {
          this.saving.set(false);
          if (err.status === 409) {
            this.conflictError.set(
              'تم تعديل هذا المشهد بواسطة مستخدم آخر. الإصدار المتوقع لم يعد متطابقاً مع قاعدة البيانات.'
            );
          } else {
            this.error.set(extractApiErrorMessage(err, 'فشل حفظ إعدادات المشهد.'));
            this.autoClearError();
          }
        }
      });
  }

  reloadLatestVersion(): void {
    this.conflictError.set(null);
    if (this.studioMode() === 'assembly') {
      this.loadAssemblyStudio();
    } else {
      this.loadScanPreview();
    }
  }

  formatTriangles(count: number): string {
    if (count >= 1_000_000) {
      return `${(count / 1_000_000).toFixed(2)}M`;
    }
    if (count >= 1_000) {
      return `${Math.round(count / 1_000)}K`;
    }
    return String(count);
  }

  getTargetLabelByInstanceId(instanceId: string): string {
    return this.assembledRoomsMap().get(instanceId)?.displayLabel || instanceId;
  }

  private triggerSaveSuccessToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.saveSuccess.set(false), 3000);
  }

  private triggerSpawnSavedToast(): void {
    this.spawnSavedToast.set(true);
    if (this.spawnTimer) clearTimeout(this.spawnTimer);
    this.spawnTimer = setTimeout(() => this.spawnSavedToast.set(false), 2500);
  }

  private autoClearError(): void {
    setTimeout(() => this.error.set(null), 5000);
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
        if (this.studioMode() === 'assembly' && this.assemblyStudio()) {
          this.syncAssemblyToEditor();
        } else if (this.studioMode() === 'legacy') {
          this.syncActiveRoomToEditor();
        }
        break;

      case 'studio:assemblyLoadProgress': {
        const loaded = Number(data.loaded ?? data.payload?.loaded ?? 0);
        const total = Number(data.total ?? data.payload?.total ?? 0);
        if (total > 0) {
          this.assemblyLoadProgress.set({ loaded, total });
        }
        break;
      }

      case 'studio:assemblyLoaded': {
        const totalTriangles = data.totalTriangles ?? data.payload?.totalTriangles;
        if (typeof totalTriangles === 'number' && Number.isFinite(totalTriangles)) {
          this.editorTotalTriangles.set(totalTriangles);
        }
        this.assemblyLoadProgress.set(null);
        break;
      }

      case 'studio:roomSelected': {
        const instanceId = data.instanceId ?? data.payload?.instanceId;
        if (
          this.studioMode() === 'assembly' &&
          typeof instanceId === 'string' &&
          this.assembledRoomsMap().has(instanceId)
        ) {
          this.activeInstanceId.set(instanceId);
          this.applyAssemblyCropSliders(this.assembledRoomsMap().get(instanceId) ?? null);
          this.refreshHotspotTargetDefault();
        }
        break;
      }

      case 'studio:roomTransformChanged': {
        const instanceId = data.instanceId ?? data.payload?.instanceId;
        const transform = data.transform ?? data.payload?.transform;
        const isFinal = Boolean(data.isFinal ?? data.payload?.isFinal ?? true);
        if (
          this.studioMode() === 'assembly' &&
          typeof instanceId === 'string' &&
          transform &&
          typeof transform === 'object'
        ) {
          this.applyInboundRoomTransform(instanceId, transform, isFinal);
        }
        break;
      }

      case 'studio:splatPicked': {
        const coords = data.coords ?? data.payload?.coords;
        if (coords && this.isPlacingHotspot()) {
          if (this.studioMode() === 'assembly') {
            const pickedInstanceId = data.instanceId ?? data.payload?.instanceId ?? null;
            this.addAssemblyHotspotAtCoords(coords, pickedInstanceId);
          } else {
            this.addHotspotAtCoords(coords);
          }
        }
        break;
      }

      case 'studio:spawnPoseCaptured': {
        const rawPose = data.pose ?? data.payload?.pose;
        if (!rawPose) break;

        if (this.studioMode() === 'assembly') {
          const targetInstanceId =
            (data.instanceId ?? data.payload?.instanceId) || this.activeInstanceId();
          const room = this.assembledRoomsMap().get(targetInstanceId);
          if (!room) break;

          const poseArr: number[] | undefined = Array.isArray(rawPose.pose)
            ? rawPose.pose
            : Array.isArray(rawPose)
              ? rawPose
              : undefined;

          const position: [number, number, number] =
            Array.isArray(rawPose.position) && rawPose.position.length === 3
              ? [Number(rawPose.position[0]), Number(rawPose.position[1]), Number(rawPose.position[2])]
              : poseArr && poseArr.length >= 3
                ? [Number(poseArr[0]), Number(poseArr[1]), Number(poseArr[2])]
                : [0, 1.6, 0];

          const target: [number, number, number] =
            Array.isArray(rawPose.target) && rawPose.target.length === 3
              ? [Number(rawPose.target[0]), Number(rawPose.target[1]), Number(rawPose.target[2])]
              : poseArr && poseArr.length >= 6
                ? [Number(poseArr[3]), Number(poseArr[4]), Number(poseArr[5])]
                : [0, 1.5, -1];

          const fov =
            typeof rawPose.fov === 'number' && Number.isFinite(rawPose.fov)
              ? rawPose.fov
              : poseArr && poseArr.length >= 7
                ? Number(poseArr[6])
                : 60;

          const nextMap = new Map(this.assembledRoomsMap());
          nextMap.set(targetInstanceId, {
            ...room,
            spawnPose: { position, target, fov }
          });
          this.assembledRoomsMap.set(nextMap);
          this.isDirty.set(true);
          this.triggerSpawnSavedToast();
        } else {
          const pose = rawPose.pose || rawPose.position;
          this.spawnPose.set(pose);
          this.persistCurrentRoomToConfig();
          this.isDirty.set(true);
          this.triggerSpawnSavedToast();
        }
        break;
      }

      case 'studio:cropBoxChanged':
        if (
          this.studioMode() === 'legacy' &&
          data.bounds &&
          Array.isArray(data.bounds) &&
          data.bounds.length === 6
        ) {
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
          this.isDirty.set(true);
        }
        break;

      case 'studio:floorTiltChanged':
        if (this.studioMode() === 'legacy' && typeof data.degrees === 'number') {
          this.floorTilt.set(data.degrees);
          this.persistCurrentRoomToConfig();
          this.isDirty.set(true);
        }
        break;
    }
  };
}
